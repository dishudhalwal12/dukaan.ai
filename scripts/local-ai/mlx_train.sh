#!/usr/bin/env bash
# mlx_train.sh - 1-Click Unattended Fine-Tuning on Apple M1 (8GB RAM)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

echo "=== [1/4] Setting up Python Virtual Environment for Apple Silicon MLX ==="
if [ ! -d ".venv_mlx" ]; then
    python3 -m venv .venv_mlx
fi
source .venv_mlx/bin/activate
pip install --upgrade pip
pip install "mlx-lm[train]>=0.21.0" huggingface_hub

echo "=== [2/4] Verifying Synthetic Dukaan.ai Dataset ==="
if [ ! -f "data/train.jsonl" ]; then
    python3 "$SCRIPT_DIR/generate_dataset.py"
fi

echo "=== [3/4] Writing Memory-Safe MLX Configuration (lora_config.yaml) ==="
cat << 'EOF' > lora_config.yaml
# Base model from Hugging Face
model: "Qwen/Qwen2.5-1.5B-Instruct"

# Dataset directory containing train.jsonl, valid.jsonl, test.jsonl
data: "./data"
train: true
fine_tune_type: "lora"

# Memory-safe hyperparameters for 8GB M1 MacBook
batch_size: 1
grad_accumulation_steps: 8
iters: 1800
val_batches: 25
learning_rate: 2.0e-4
steps_per_report: 10
steps_per_eval: 100
save_every: 200
max_seq_length: 1024
grad_checkpoint: true
mask_prompt: true
seed: 42

# Output directory for LoRA adapters
adapter_path: "./adapters"

# LoRA Rank r=16, lora_alpha=32 (In MLX: scale = lora_alpha / rank = 32 / 16 = 2.0)
num_layers: 16
lora_parameters:
  keys:
    - "self_attn.q_proj"
    - "self_attn.k_proj"
    - "self_attn.v_proj"
    - "self_attn.o_proj"
    - "mlp.gate_proj"
    - "mlp.up_proj"
    - "mlp.down_proj"
  rank: 16
  scale: 2.0
  dropout: 0.0
EOF

echo "=== [4/4] Starting Unattended M1 Fine-Tuning (Preventing Sleep via caffeinate) ==="
echo "Logs are writing to train.log. You can safely close the terminal."
nohup caffeinate -dims python3 -m mlx_lm.lora --config lora_config.yaml > train.log 2>&1 &
TRAIN_PID=$!
echo "✅ Training started with PID: $TRAIN_PID"
echo "👉 To view live progress: tail -f train.log"
echo "👉 Checkpoints saved in:  ls -lh ./adapters/"
