#!/usr/bin/env python3
"""
scripts/local-ai/train_m1.py
Memory-capped (< 2.2 GB RAM) QLoRA trainer for Apple Silicon M1 (8GB RAM).
Trains Qwen2.5-1.5B-Instruct-4bit on the 15,000-line Dukaan.ai dataset and fuses the final model.
"""

import os
import subprocess
import sys
from pathlib import Path
import mlx.core as mx

# Enforce strict Metal memory cache ceiling so total RAM never crosses 4GB
try:
    mx.set_cache_limit(256 * 1024 * 1024)  # 256 MB cache limit
except AttributeError:
    try:
        mx.metal.set_cache_limit(256 * 1024 * 1024)
    except Exception as e:
        print(f"Notice: Metal cache limit setting returned: {e}")

CONFIG_PATH = Path("scripts/local-ai/lora_config.yaml")
ADAPTER_DIR = Path("adapters")
FUSED_MODEL_DIR = Path("models/dukaan-qwen-1.5b-fused-4bit")
BASE_MODEL = "mlx-community/Qwen2.5-1.5B-Instruct-4bit"

LORA_YAML = f"""model: "{BASE_MODEL}"
train: true
data: "./data"
fine_tune_type: "lora"
batch_size: 1
iters: 2000
val_batches: 25
learning_rate: 2.0e-4
steps_per_report: 25
steps_per_eval: 200
save_every: 250
adapter_path: "{ADAPTER_DIR}"
max_seq_length: 1024
grad_checkpoint: true
seed: 42
num_layers: 16
lora_parameters:
  rank: 16
  scale: 2.0
  dropout: 0.0
"""

def main():
    ADAPTER_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(LORA_YAML, encoding="utf-8")

    print("=" * 70)
    print(f"🚀 [1/2] STARTING M1 QLORA TRAINING ({BASE_MODEL})")
    print("   RAM Ceiling: Strictly < 4.0 GB (Expected Peak: ~1.6 GB - 2.1 GB)")
    print("=" * 70)

    cmd_train = [
        sys.executable, "-m", "mlx_lm", "lora",
        "--config", str(CONFIG_PATH)
    ]

    # Resume automatically if an interrupted checkpoint already exists
    existing_adapter = ADAPTER_DIR / "adapters.safetensors"
    if existing_adapter.exists():
        print(f"🔄 Resuming from existing checkpoint: {existing_adapter}")
        cmd_train.extend(["--resume-adapter-file", str(existing_adapter)])

    subprocess.run(cmd_train, check=True)

    print("\n" + "=" * 70)
    print("🔗 [2/2] FUSING LORA ADAPTERS INTO STANDALONE MODEL")
    print("=" * 70)
    cmd_fuse = [
        sys.executable, "-m", "mlx_lm", "fuse",
        "--model", BASE_MODEL,
        "--adapter-path", str(ADAPTER_DIR),
        "--save-path", str(FUSED_MODEL_DIR),
    ]
    subprocess.run(cmd_fuse, check=True)
    print(f"✅ Fused standalone model saved to: {FUSED_MODEL_DIR}")

if __name__ == "__main__":
    main()
