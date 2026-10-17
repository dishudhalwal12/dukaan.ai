#!/usr/bin/env bash
# export_gguf.sh - Fuse MLX LoRA adapters and quantize to dukaan-qwen-1.5b-q4_k_m.gguf
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

if [ ! -d ".venv_mlx" ]; then
    echo "❌ Error: Virtual environment .venv_mlx not found. Run mlx_train.sh first."
    exit 1
fi
source .venv_mlx/bin/activate

echo "=== [1/4] Fusing LoRA Adapters into Base Model ==="
python3 -m mlx_lm.fuse \
    --model "Qwen/Qwen2.5-1.5B-Instruct" \
    --adapter-path "./adapters" \
    --save-path "./fused_dukaan_model" \
    --dequantize

echo "=== [2/4] Cloning & Building llama.cpp tools ==="
if [ ! -d "llama.cpp" ]; then
    git clone https://github.com/ggerganov/llama.cpp.git
fi
cd llama.cpp
cmake -B build -DGGML_METAL=ON
cmake --build build --config Release -j 4
pip install -r requirements/requirements-convert_hf_to_gguf.txt
cd "$PROJECT_ROOT"

echo "=== [3/4] Converting Fused Model to FP16 GGUF ==="
python3 llama.cpp/convert_hf_to_gguf.py \
    ./fused_dukaan_model \
    --outfile dukaan-qwen-1.5b-f16.gguf \
    --outtype f16

echo "=== [4/4] Quantizing FP16 GGUF to 4-Bit Q4_K_M ==="
./llama.cpp/build/bin/llama-quantize \
    dukaan-qwen-1.5b-f16.gguf \
    dukaan-qwen-1.5b-q4_k_m.gguf \
    Q4_K_M

rm -f dukaan-qwen-1.5b-f16.gguf

echo "=================================================================="
echo "✅ SUCCESS! Quantized GGUF model created:"
ls -lh dukaan-qwen-1.5b-q4_k_m.gguf
echo "=================================================================="
