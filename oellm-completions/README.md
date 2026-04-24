# oellm-completions site bundle

Static viewer for the dolci_translated qualitative completions experiment. Files here are the deployable artifact — drop them into `ferreirafabio.github.io/oellm-completions/` to publish at <https://ferreirafabio.github.io/oellm-completions/>.

## Files

| File | Purpose |
|---|---|
| `index.html`, `app.js`, `style.css` | Vanilla static viewer (no build, no framework) |
| `prompts_lmarena.json` | 274 prompts (100 fr + 100 de + 74 fi) sampled from lmarena-ai/arena-human-preference-100k |
| `completions.json` | All model outputs (one record per `<model_id>::<lang>::<idx>`) |

## Local preview

```bash
cd oellm/experiments/dolci_translated/site
python -m http.server 8765
# open http://localhost:8765/
```

## Regenerate

```bash
# 1. Re-sample prompts (only if you want a different seed / count)
HF_HOME=$PWD/../../../../models/huggingface \
    .venv/bin/python ../scripts/qualitative/sample_lmarena_prompts.py

# 2. Convert intermediate ckpts (if not already done)
sbatch oellm/experiments/dolci_translated/scripts/qualitative/convert_intermediate_ckpts.sh

# 3. Generate completions (resumable via incremental writes)
sbatch oellm/experiments/dolci_translated/scripts/qualitative/generate_completions.sh
```

## Deploy to ferreirafabio.github.io/oellm-completions/

The `ferreirafabio.github.io` repo is a *separate* GitHub Pages repo (not a subdirectory of this one). One-time setup:

```bash
# clone it once next to open-instruct
cd /work/dlclarge2/ferreira-oellm
git clone https://github.com/ferreirafabio/ferreirafabio.github.io.git
mkdir -p ferreirafabio.github.io/oellm-completions
```

Then on each update:

```bash
cp -r oellm/experiments/dolci_translated/site/* /work/dlclarge2/ferreira-oellm/ferreirafabio.github.io/oellm-completions/
cd /work/dlclarge2/ferreira-oellm/ferreirafabio.github.io
git add oellm-completions
git commit -m "update oellm-completions ($(date -u +%Y-%m-%d))"
git push
```

GitHub Pages typically rebuilds within ~1 minute. Live URL: <https://ferreirafabio.github.io/oellm-completions/>.

## Schema

`completions.json`:

```json
{
  "models": [
    {"id": "A-75en-step3998", "label": "A-75en step 3998", "group": "A-75en", "step": 3998}
  ],
  "prompts": [
    {"idx": 0, "lang": "de", "prompt": "...", "source_question_id": "..."}
  ],
  "completions": {
    "A-75en-step3998::de::0": "Generated text..."
  }
}
```

Keys are `<model_id>::<lang>::<prompt_idx>`. Missing keys render as "(not generated yet)".
