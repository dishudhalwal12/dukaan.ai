#!/usr/bin/env bash
# run_server.sh - Starts lightweight OpenAI-compatible llama-server on port 8080
set -euo pipefail

MODEL_PATH="${1:-./dukaan-qwen-1.5b-q4_k_m.gguf}"
PORT=8080

if [ ! -f "$MODEL_PATH" ]; then
    echo "❌ Error: Model file $MODEL_PATH not found!"
    echo "Make sure dukaan-qwen-1.5b-q4_k_m.gguf exists."
    exit 1
fi

# Detect OS
UNAME_S="$(uname -s)"
if [ "$UNAME_S" = "Linux" ]; then
    echo "=== [1/2] Ensuring llama-server is built for Linux VPS ==="
    if [ ! -f "./llama.cpp/build/bin/llama-server" ]; then
        sudo apt-get update -qq || true
        sudo apt-get install -y -qq build-essential cmake git curl || true
        if [ ! -d "llama.cpp" ]; then
            git clone --depth 1 https://github.com/ggerganov/llama.cpp.git
        fi
        cmake -B llama.cpp/build -S llama.cpp -DGGML_NATIVE=ON -DLLAMA_CURL=OFF -DBUILD_SHARED_LIBS=OFF
        cmake --build llama.cpp/build --config Release --target llama-server -j 2
    fi
    LLAMA_BIN="./llama.cpp/build/bin/llama-server"
    ulimit -l unlimited 2>/dev/null || true
else
    # macOS
    echo "=== [1/2] Ensuring llama-server is built for macOS (Metal GPU) ==="
    if [ ! -f "./llama.cpp/build/bin/llama-server" ]; then
        if [ ! -d "llama.cpp" ]; then
            git clone --depth 1 https://github.com/ggerganov/llama.cpp.git
        fi
        cmake -B llama.cpp/build -S llama.cpp -DGGML_METAL=ON
        cmake --build llama.cpp/build --config Release --target llama-server -j 4
    fi
    LLAMA_BIN="./llama.cpp/build/bin/llama-server"
fi

echo "=== [2/2] Starting Dukaan AI Local Server on http://0.0.0.0:$PORT ==="
exec "$LLAMA_BIN" \
    --model "$MODEL_PATH" \
    --alias "dukaan-slm" \
    --host 0.0.0.0 \
    --port "$PORT" \
    --ctx-size 2048 \
    --threads 2 \
    --threads-batch 2 \
    --parallel 1 \
    --batch-size 256 \
    --ubatch-size 128 \
    --cache-type-k q8_0 \
    --cache-type-v q8_0 \
    --cont-batching \
    --mlock \
    --no-webui
