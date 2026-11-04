import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

const execPromise = promisify(exec);
const TEMP_DIR = path.resolve(process.cwd(), 'store/temp_audio');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const WHISPER_BIN = fs.existsSync('/Users/dishu/Library/Python/3.9/bin/whisper')
  ? '/Users/dishu/Library/Python/3.9/bin/whisper'
  : 'whisper';

/**
 * WhatsApp official media hosts end in .whatsapp.net (e.g. mmg.whatsapp.net).
 * Also support .whatsapp.com and .fbcdn.net for Meta media CDN routing.
 */
const ALLOWED_MEDIA_HOST_SUFFIXES = [
  'whatsapp.net',
  'whatsapp.com',
  'fbcdn.net',
];

export const MAX_AUDIO_SIZE_BYTES = Number(process.env.MAX_VOICE_NOTE_BYTES) || 16 * 1024 * 1024; // 16 MB default
export const AUDIO_DOWNLOAD_TIMEOUT_MS = Number(process.env.VOICE_NOTE_DOWNLOAD_TIMEOUT_MS) || 20_000; // 20s default

/**
 * Verifies that a media URL uses HTTPS and points to an authorized WhatsApp/Meta media host.
 */
export function isAllowedMediaHost(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_MEDIA_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith('.' + suffix)
    );
  } catch {
    return false;
  }
}

/**
 * Validates the audioMessage descriptor upfront before initiating any network download.
 */
export function validateAudioMessageDescriptor(audioMessage) {
  if (!audioMessage || typeof audioMessage !== 'object') {
    return { valid: false, error: 'Missing audioMessage descriptor' };
  }

  // 1. If URL is present, validate scheme and host
  if (audioMessage.url) {
    if (!isAllowedMediaHost(audioMessage.url)) {
      return {
        valid: false,
        error: `Disallowed media host or scheme in URL: ${audioMessage.url}`,
      };
    }
  }

  // 2. If fileLength is declared, validate against MAX_AUDIO_SIZE_BYTES
  const declaredLength = Number(audioMessage.fileLength?.low ?? audioMessage.fileLength);
  if (!Number.isNaN(declaredLength) && declaredLength > 0 && declaredLength > MAX_AUDIO_SIZE_BYTES) {
    return {
      valid: false,
      error: `Declared audio size ${declaredLength} exceeds maximum limit of ${MAX_AUDIO_SIZE_BYTES} bytes`,
    };
  }

  return { valid: true };
}

/**
 * Stream audio chunks with a strict size cap and timeout, preventing memory exhaustion.
 */
export async function downloadAudioStreamWithCap(stream, maxBytes = MAX_AUDIO_SIZE_BYTES, timeoutMs = AUDIO_DOWNLOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let totalBytes = 0;
    const chunks = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (typeof stream.destroy === 'function') {
        stream.destroy();
      }
      reject(new Error(`Audio download timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    (async () => {
      try {
        for await (const chunk of stream) {
          if (timedOut) return;
          totalBytes += chunk.length;
          if (totalBytes > maxBytes) {
            if (typeof stream.destroy === 'function') {
              stream.destroy();
            }
            throw new Error(`Audio download exceeded maximum limit of ${maxBytes} bytes`);
          }
          chunks.push(chunk);
        }
        clearTimeout(timer);
        resolve(Buffer.concat(chunks, totalBytes));
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    })();
  });
}

/**
 * Transcribe a WhatsApp audioMessage using local Whisper or Groq/OpenAI Whisper
 */
export async function transcribeAudioMessage(audioMessage) {
  if (!audioMessage) return null;

  const validation = validateAudioMessageDescriptor(audioMessage);
  if (!validation.valid) {
    console.warn('[Audio] Descriptor validation failed:', validation.error);
    return null;
  }

  const tempId = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inputOggPath = path.join(TEMP_DIR, `${tempId}.ogg`);
  const wavPath = path.join(TEMP_DIR, `${tempId}.wav`);
  const filesToCleanup = new Set([inputOggPath, wavPath]);

  try {
    // 1. Download audio stream from WhatsApp servers with size cap and timeout
    console.log('[Audio] Downloading WhatsApp voice note...');
    const stream = await downloadContentFromMessage(audioMessage, 'audio');
    const buffer = await downloadAudioStreamWithCap(stream, MAX_AUDIO_SIZE_BYTES, AUDIO_DOWNLOAD_TIMEOUT_MS);

    if (!buffer || buffer.length === 0) {
      console.warn('[Audio] Downloaded empty audio buffer');
      return null;
    }

    fs.writeFileSync(inputOggPath, buffer);
    console.log(`[Audio] Saved voice note (${(buffer.length / 1024).toFixed(1)} KB)`);

    // 2. Check for Cloud Whisper API (Groq or OpenAI) for sub-second cloud transcription
    const groqKey = (process.env.GROQ_API_KEY || '').trim();
    const openaiKey = (process.env.OPENAI_API_KEY || '').trim();

    if (groqKey || openaiKey) {
      try {
        const apiUrl = groqKey
          ? 'https://api.groq.com/openai/v1/audio/transcriptions'
          : 'https://api.openai.com/v1/audio/transcriptions';
        const apiKey = groqKey || openaiKey;
        const model = groqKey ? 'whisper-large-v3' : 'whisper-1';

        const formData = new FormData();
        const fileBlob = new Blob([buffer], { type: audioMessage.mimetype || 'audio/ogg' });
        formData.append('file', fileBlob, 'audio.ogg');
        formData.append('model', model);
        formData.append('language', 'en');

        const apiRes = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: formData
        });

        if (apiRes.ok) {
          const result = await apiRes.json();
          if (result.text && result.text.trim()) {
            console.log(`[Audio Cloud Whisper] Transcribed: "${result.text.trim()}"`);
            return result.text.trim();
          }
        }
      } catch (cloudErr) {
        console.warn('[Audio] Cloud Whisper failed, falling back to local Whisper:', cloudErr.message);
      }
    }

    // 3. Convert OGG to WAV using FFmpeg for optimal Whisper processing
    try {
      await execPromise(`ffmpeg -y -i "${inputOggPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" 2>/dev/null`);
    } catch (ffmpegErr) {
      // If ffmpeg fails, try passing ogg directly to whisper
      console.warn('[Audio] FFmpeg conversion notice, using input file directly');
    }

    const audioToTranscribe = fs.existsSync(wavPath) ? wavPath : inputOggPath;

    // 4. Run local Whisper CLI
    console.log('[Audio] Running local Whisper transcription...');
    const startTime = Date.now();
    const cmd = `${WHISPER_BIN} "${audioToTranscribe}" --model tiny --language en --fp16 False --output_format txt --output_dir "${TEMP_DIR}" 2>/dev/null`;
    await execPromise(cmd);

    const baseName = path.basename(audioToTranscribe, path.extname(audioToTranscribe));
    const txtPath = path.join(TEMP_DIR, `${baseName}.txt`);
    filesToCleanup.add(txtPath);

    let transcribedText = '';
    if (fs.existsSync(txtPath)) {
      transcribedText = fs.readFileSync(txtPath, 'utf8').trim();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Audio Local Whisper] Finished in ${duration}s: "${transcribedText}"`);

    return transcribedText || null;
  } catch (err) {
    console.error('[Audio] Transcription error:', err.message);
    return null;
  } finally {
    cleanup(filesToCleanup);
  }
}

function cleanup(files) {
  for (const f of files) {
    try {
      if (f && fs.existsSync(f)) fs.unlinkSync(f);
    } catch (e) {}
  }
}
