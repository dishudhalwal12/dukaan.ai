#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"
source .venv_mlx/bin/activate

MODEL_DIR="./models/dukaan-qwen-1.5b-fused-4bit"
if [ ! -d "$MODEL_DIR" ]; then
    echo "Fused model not found at $MODEL_DIR, using base + adapters..."
    nohup caffeinate -dims python3 -m mlx_lm server \
        --model "mlx-community/Qwen2.5-1.5B-Instruct-4bit" \
        --adapter-path "./adapters" \
        --host 127.0.0.1 \
        --port 8080 > scripts/local-ai/server.log 2>&1 &
else
    nohup caffeinate -dims python3 -m mlx_lm server \
        --model "$MODEL_DIR" \
        --host 127.0.0.1 \
        --port 8080 > scripts/local-ai/server.log 2>&1 &
fi

echo $! > scripts/local-ai/server.pid
echo "✅ Local Dukaan.ai SLM Server started on http://127.0.0.1:8080 (PID: $(cat scripts/local-ai/server.pid))"
