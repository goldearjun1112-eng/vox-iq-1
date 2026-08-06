# VoxIQ — PWA package (on-device AI, no API key)

## Model: LFM2-1.2B-Extract
Analysis runs entirely in the browser via
[Transformers.js](https://github.com/huggingface/transformers.js), using
[`onnx-community/LFM2-1.2B-Extract-ONNX`](https://huggingface.co/onnx-community/LFM2-1.2B-Extract-ONNX) —
a model from Liquid AI trained specifically to pull structured data (JSON/XML/YAML)
out of unstructured text against a schema. That's a better fit for this app's
job than a general-purpose chatbot model, which is what the first on-device
version used (Qwen2.5-0.5B-Instruct — swapped out for this reason).

Two other things make it a reasonable choice for phones specifically:
- **Architecture**: LFM2 is a hybrid conv+attention design Liquid built for
  edge/mobile deployment — fast on WebGPU, and still efficient on CPU-only
  (wasm) devices, unlike a plain transformer of the same parameter count.
- **Task fit**: it defaults to JSON output and follows an explicit
  field-by-field schema prompt (see `buildMessages()` in the module script)
  noticeably more reliably than a general instruct model asked to "reply with
  this JSON shape."

None of this makes it accurate in an absolute sense. It's 1.2B parameters,
quantized to 4-bit. It is not Claude. It will still get things wrong,
especially on nuance, on longer transcripts, and on Hindi/Marathi-heavy input.
It is meaningfully better than the 0.5B general model at *staying inside the
schema*, which was the main failure mode before (see `fallbackAnalysis()` —
still there as a safety net when the model's output isn't valid JSON at all).

## Files
- `index.html` — the app. Two `<script>` blocks at the bottom: the classic
  script (UI/state) and a `type="module"` script that loads Transformers.js
  and exposes `window.getLocalModel` / `window.analyzeLocally` /
  `window.resetLocalModel`.
- `manifest.json`, `sw.js`, `offline.html`, `icons/` — unchanged PWA shell.

## Deploy
Static HTTPS host, no build step. Keep relative paths intact. Two extra
domains need to be reachable from the browser (not proxied by the service
worker — called directly by the module script):
- `cdn.jsdelivr.net` — the Transformers.js library
- `huggingface.co` and its CDN — the ~700MB model weights

Blocked on restrictive/corporate networks and the download will fail with
whatever error the fetch surfaces in `voxiq:model-status` / the toast.

## Size and speed, concretely
- **~700MB one-time download** (vs ~300MB for the earlier 0.5B model) —
  roughly 2.5x. Warn users before they tap "Download" on cellular; there's no
  confirmation dialog in the current build.
- **WebGPU path**: reported speeds of 200+ tok/s for this model family in the
  wild — fast enough that generation itself won't be the bottleneck once
  loaded. WebGPU needs Chrome 113+ (desktop or Android); Firefox needs a flag;
  Safari support is experimental.
- **wasm/CPU fallback**: slower, but the hybrid-conv architecture is
  specifically designed to stay usable off-GPU, unlike most same-size
  transformer models. Still expect this path to be noticeably slower than
  WebGPU on lower-end Android phones.
- **RAM**: a 1.2B model is a heavier tab-memory footprint than the 0.5B one
  was. Older/low-RAM Android devices are more likely to see the tab crash or
  the load simply fail. There's no automatic step-down to a smaller model —
  if that turns out to be a real problem for your users, Liquid also publishes
  `onnx-community/LFM2-350M-Extract-ONNX`, same schema-following prompt
  format, smaller and faster, less accurate. Swap `MODEL_ID` in the module
  script to switch.

## What's unchanged from the previous on-device version
- Cached by the browser after first download (Transformers.js's own Cache
  Storage usage, not `sw.js`) — analysis works offline after that.
- `webkitSpeechRecognition` for live transcription still needs network
  regardless of PWA/model status, and still doesn't exist on iOS Safari.
  Packaging and model choice can't touch either of those.
- `sw.js`'s `activate` handler only deletes its own old cache versions
  (`voxiq-shell-*`) — it will not wipe the model's cache. Don't broaden that
  filter if you fork this further; the earlier version of this file did, and
  it would have forced a silent ~700MB re-download on every SW update.
