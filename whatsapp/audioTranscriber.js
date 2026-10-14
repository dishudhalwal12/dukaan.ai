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
 * Transcribe a WhatsApp audioMessage using local Whisper or Groq/OpenAI Whisper
 */
export async function transcribeAudioMessage(audioMessage) {
  if (!audioMessage) return null;

  const tempId = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inputOggPath = path.join(TEMP_DIR, `${tempId}.ogg`);
  const wavPath = path.join(TEMP_DIR, `${tempId}.wav`);

  try {
    // 1. Download audio stream from WhatsApp servers
    console.log('[Audio] Downloading WhatsApp voice note...');
    const stream = await downloadContentFromMessage(audioMessage, 'audio');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }

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
            cleanup([inputOggPath, wavPath]);
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

    let transcribedText = '';
    if (fs.existsSync(txtPath)) {
      transcribedText = fs.readFileSync(txtPath, 'utf8').trim();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Audio Local Whisper] Finished in ${duration}s: "${transcribedText}"`);

    cleanup([inputOggPath, wavPath, txtPath]);
    return transcribedText || null;
  } catch (err) {
    console.error('[Audio] Transcription error:', err.message);
    cleanup([inputOggPath, wavPath]);
    return null;
  }
}

function cleanup(files) {
  for (const f of files) {
    try {
      if (f && fs.existsSync(f)) fs.unlinkSync(f);
    } catch (e) {}
  }
}
