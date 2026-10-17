# scripts/local-ai/colab_train.py
# Run this script in Google Colab (Free T4 GPU) to train in 45 minutes!
# Step 1: Open Google Colab -> Runtime -> Change runtime type -> T4 GPU
# Step 2: Upload data/train.jsonl to the Colab files pane
# Step 3: Run the code below:

"""
!pip install -q "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
!pip install -q --no-deps trl peft accelerate bitsandbytes

import torch
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments
from unsloth import FastLanguageModel

max_seq_length = 1024
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="Qwen/Qwen2.5-1.5B-Instruct",
    max_seq_length=max_seq_length,
    load_in_4bit=True,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    lora_alpha=32,
    lora_dropout=0,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    use_gradient_checkpointing="unsloth",
    random_state=42,
)

dataset = load_dataset("json", data_files={"train": "train.jsonl"}, split="train")
dataset = dataset.map(
    lambda x: {"text": tokenizer.apply_chat_template(x["messages"], tokenize=False, add_generation_prompt=False)}
)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=max_seq_length,
    args=TrainingArguments(
        per_device_train_batch_size=4,
        gradient_accumulation_steps=4,
        warmup_steps=30,
        max_steps=600,
        learning_rate=2e-4,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=10,
        output_dir="outputs",
        optim="adamw_8bit",
        seed=42,
    ),
)
trainer.train()

# Merge LoRA and quantize directly to Q4_K_M GGUF
model.save_pretrained_gguf("dukaan_gguf", tokenizer, quantization_method="q4_k_m")
!mv dukaan_gguf/unsloth.Q4_K_M.gguf dukaan-qwen-1.5b-q4_k_m.gguf
print("Download dukaan-qwen-1.5b-q4_k_m.gguf and place in your dukaan.ai folder!")
"""
