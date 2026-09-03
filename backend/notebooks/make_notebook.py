import json

cells = [
    {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "# UNDP SDG Text Classifier \u2014 Fine-tune (Colab)\n",
            "\n",
            "Fine-tune `xlm-roberta-base` on the **official UNDP sdgi-corpus** (EN/ES/FR, multi-label over the 17 Sustainable Development Goals).\n",
            "\n",
            "This notebook runs on **Google Colab** with a GPU (Runtime \u2192 Change runtime type \u2192 **T4 GPU**). No Google Drive is required: the trained model is packed into a `.zip` you download at the end and drop into `backend/models/undp-sdg-xlmr/`.\n",
            "\n",
            "> If your Colab runtime has no GPU, the final `trainer.train()` step will be very slow \u2014 use Runtime \u2192 Change runtime type \u2192 T4."
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# @title 1) Check runtime & install deps\n",
            "import os, sys, json, gc, zipfile, shutil\n",
            "import numpy as np\n",
            "import torch\n",
            "\n",
            "print('gpu:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE - switch to T4 GPU!')\n",
            "\n",
            "# Pin transformers to a known-good version (API: warmup_steps + processing_class).\n",
            "!pip install -q \"transformers==5.16.1\" datasets accelerate evaluate sentencepiece\n",
            "\n",
            "from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments, DataCollatorWithPadding\n",
            "from datasets import load_dataset\n",
            "from sklearn.metrics import f1_score, precision_score, recall_score\n",
            "print('ready')"
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# @title 2) Load the UNDP corpus (no Drive needed)\n",
            "# Keep only text + labels (drop the heavy embedding column)\n",
            "ds = load_dataset('UNDP/sdgi-corpus')  # has train + test splits\n",
            "train = ds['train'].remove_columns([c for c in ds['train'].column_names if c not in ('text','labels')])\n",
            "test  = ds['test'].remove_columns([c for c in ds['test'].column_names if c not in ('text','labels')])\n",
            "print('train', len(train), '| test', len(test))\n",
            "print('features', train.column_names)\n",
            "print('example labels', train[0]['labels'])\n",
            "print('example text :', train[0]['text'][:160].replace('\\n',' '))"
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# @title 3) Multi-label encoding (17 outputs)\n",
            "num_labels = 17\n",
            "\n",
            "def to_onehot(example):\n",
            "    lab = example['labels']\n",
            "    if not isinstance(lab, (list, tuple)):\n",
            "        lab = [lab]\n",
            "    vec = [0]*num_labels\n",
            "    for x in lab:\n",
            "        vec[int(x)-1] = 1\n",
            "    return {'onehot': vec, 'text': example['text']}\n",
            "\n",
            "train = train.map(to_onehot, remove_columns=['labels'])\n",
            "test  = test.map(to_onehot, remove_columns=['labels'])\n",
            "train = train.rename_column('onehot','labels')\n",
            "test  = test.rename_column('onehot','labels')\n",
            "\n",
            "arr = np.array(train['labels'])\n",
            "print('positive per goal:', dict(zip(range(1,18), arr.sum(0).astype(int))))"
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# @title 4) Tokenize (multilingual xlm-roberta-base)\n",
            "MODEL_NAME = 'xlm-roberta-base'\n",
            "tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)\n",
            "\n",
            "def tok(batch):\n",
            "    return tokenizer(batch['text'], truncation=True, padding='max_length', max_length=256)\n",
            "\n",
            "train = train.map(tok, batched=True)\n",
            "test  = test.map(tok, batched=True)\n",
            "train.set_format('torch', columns=['input_ids','attention_mask','labels'])\n",
            "test.set_format('torch', columns=['input_ids','attention_mask','labels'])\n",
            "print('tokenized', len(train), 'train /', len(test), 'test')"
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# @title 5) Model with a multi-label head\n",
            "model = AutoModelForSequenceClassification.from_pretrained(\n",
            "    MODEL_NAME,\n",
            "    num_labels=num_labels,\n",
            "    problem_type='multi_label_classification'\n",
            ")\n",
            "print('params', round(model.num_parameters()/1e6, 1), 'M')"
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# @title 6) Metrics (macro / weighted F1, precision, recall)\n",
            "def compute_metrics(eval_pred):\n",
            "    logits, labels = eval_pred\n",
            "    probs = 1/(1+np.exp(-logits))\n",
            "    preds = (probs >= 0.5).astype(int)\n",
            "    return {\n",
            "        'f1_macro': f1_score(labels, preds, average='macro', zero_division=0),\n",
            "        'f1_weighted': f1_score(labels, preds, average='weighted', zero_division=0),\n",
            "        'precision_macro': precision_score(labels, preds, average='macro', zero_division=0),\n",
            "        'recall_macro': recall_score(labels, preds, average='macro', zero_division=0),\n",
            "    }"
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# @title 7) Train (Trainer, T4 GPU)\n",
            "data_collator = DataCollatorWithPadding(tokenizer=tokenizer)\n",
            "\n",
            "args = TrainingArguments(\n",
            "    output_dir='./undp-sdg-xlmr',\n",
            "    eval_strategy='epoch',\n",
            "    save_strategy='epoch',\n",
            "    logging_strategy='steps',\n",
            "    logging_steps=100,\n",
            "    num_train_epochs=3,\n",
            "    per_device_train_batch_size=16,\n",
            "    per_device_eval_batch_size=32,\n",
            "    learning_rate=2e-5,\n",
            "    weight_decay=0.01,\n",
            "    warmup_steps=200,\n",
            "    load_best_model_at_end=True,\n",
            "    metric_for_best_model='f1_weighted',\n",
            "    greater_is_better=True,\n",
            "    fp16=True,\n",
            "    report_to=[],\n",
            "    push_to_hub=False,\n",
            ")\n",
            "\n",
            "trainer = Trainer(\n",
            "    model=model, args=args,\n",
            "    train_dataset=train, eval_dataset=test,\n",
            "    data_collator=data_collator, processing_class=tokenizer,\n",
            "    compute_metrics=compute_metrics,\n",
            ")\n",
            "\n",
            "trainer.train()"
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# @title 8) Final eval & download the model (.zip) \u2014 no Drive needed\n",
            "res = trainer.evaluate()\n",
            "print('FINAL EVAL')\n",
            "for k, v in res.items():\n",
            "    print(f'  {k}: {v:.4f}' if isinstance(v, float) else f'  {k}: {v}')\n",
            "\n",
            "# Repackage the best checkpoint under /tmp/model with a config.json, tokenizer + model\n",
            "from transformers import AutoConfig\n",
            "out_dir = '/tmp/undp-sdg-xlmr'\n",
            "if os.path.isdir(out_dir):\n",
            "    shutil.rmtree(out_dir)\n",
            "os.makedirs(out_dir, exist_ok=True)\n",
            "\n",
            "trainer.save_model(out_dir)\n",
            "tokenizer.save_pretrained(out_dir)\n",
            "\n",
            "# Add id2label/label2id mappings so the model is self-describing\n",
            "cfg = AutoConfig.from_pretrained(out_dir)\n",
            "cfg.id2label = {str(i): f'SDG{i+1}' for i in range(17)}\n",
            "cfg.label2id = {f'SDG{i+1}': i for i in range(17)}\n",
            "cfg.save_pretrained(out_dir)\n",
            "\n",
            "# Save the 17 SDG names next to the model\n",
            "sdg_names = [\n",
            "    'No Poverty','Zero Hunger','Good Health and Well-being','Quality Education',\n",
            "    'Gender Equality','Clean Water and Sanitation','Affordable and Clean Energy',\n",
            "    'Decent Work and Economic Growth','Industry, Innovation and Infrastructure',\n",
            "    'Reduced Inequalities','Sustainable Cities and Communities','Responsible Consumption and Production',\n",
            "    'Climate Action','Life Below Water','Life on Land','Peace, Justice and Strong Institutions',\n",
            "    'Partnerships for the Goals'\n",
            "]\n",
            "with open(os.path.join(out_dir, 'sdg_names.json'), 'w', encoding='utf-8') as f:\n",
            "    json.dump({'sdg': sdg_names}, f, ensure_ascii=False)\n",
            "\n",
            "# Zip it for download\n",
            "zip_path = '/content/undp-sdg-xlmr.zip'\n",
            "with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:\n",
            "    for root, _, files in os.walk(out_dir):\n",
            "        for fn in files:\n",
            "            full = os.path.join(root, fn)\n",
            "            arc = os.path.relpath(full, out_dir)\n",
            "            zf.write(full, arc)\n",
            "\n",
            "# A model needs both the index.json (tokenizer) and weights; print its size\n",
            "print('\\nZip ready:', zip_path, '(', round(os.path.getsize(zip_path)/1e6, 1), 'MB )')\n",
            "print('\\nNext steps:')\n",
            "print('1) Download undp-sdg-xlmr.zip (left panel -> Files -> click the zip).')\n",
            "print('2) Unzip it into backend/models/undp-sdg-xlmr/ (you should get config.json, model.safetensors, tokenizer, sdg_names.json).')\n",
            "print('3) The FastAPI backend will then load YOUR fine-tuned model automatically.')"
        ]
    },
]

nb = {
    "cells": cells,
    "metadata": {
        "colab": {"provenance": []},
        "kernelspec": {"name": "python3", "display_name": "Python 3"},
        "language_info": {"name": "python"}
    },
    "nbformat": 4,
    "nbformat_minor": 0
}

out = r"D:\projects\NLP Classification de projetsrapports par ODD\backend\notebooks\undp_sdg_classifier_train.ipynb"
with open(out, "w", encoding="utf-8") as f:
    json.dump(nb, f, ensure_ascii=False, indent=1)
print("wrote", out)
