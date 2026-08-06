# VoxIQ — PWA package (on-device AI, no API key)

## What changed from the API-key version
Analysis no longer calls Anthropic (or anyone else). It runs a small language
model — `onnx-community/Qwen2.5-0.5B-Instruct` — directly in the browser via
[Transformers.js](https://github.com/huggingface/transformers.js), loaded from
the jsdelivr CDN. There is no key to store, no key to leak, and no server in
the loop for analysis.

## Files
- `index.html` — the app. Two `<script>` blocks at the bottom: the original
  classic script (UI/state), and a `type="module"` script that loads
  Transformers.js and exposes `window.getLocalModel` / `window.analyzeLocally`
  / `window.resetLocalModel` for the classic script to call.
- `manifest.json`, `sw.js`, `offline.html`, `icons/` — unchanged PWA shell.

## Deploy
Same as before: any static HTTPS host (GitHub Pages, Netlify, Vercel,
Cloudflare Pages), no build step. Keep relative paths intact.

Two extra domains now need to be reachable from the browser (not proxied by
the service worker, called directly by the module script):
- `cdn.jsdelivr.net` — the Transformers.js library
- `huggingface.co` (and its CDN, e.g. `cdn-lfs-us-1.huggingface.co`) — the
  model weight files

If you're behind a restrictive corporate firewall or content-filtering
network, these may be blocked and the model download will fail.

## The real tradeoff: quality vs. no key
This is a **0.5-billion-parameter** model. For comparison, Claude is orders of
magnitude larger. Concretely, expect:
- Frequent malformed/non-JSON output — there's a regex-based fallback
  (`fallbackAnalysis`) that extracts the first few sentences as a crude
  summary when this happens. The note is still saved, marked `fallback:true`,
  and the UI shows a toast saying the output was rough.
- Weak handling of the `aiPrompt` and `blueprint` fields specifically — these
  need real reasoning, which a 0.5B model does poorly. Don't expect them to be
  reliably useful; they're the fields most likely to come back empty or
  generic.
- Noticeably worse results on Hindi/Marathi-heavy transcripts than on English
  ones — the model's multilingual capacity at this size is limited.
- On first use: a **~300MB one-time download**, plus a few seconds of
  "warm-up" while the model initializes. Say so before your users tap
  "Download" on cellular data — there's no confirmation dialog for that in
  the current build.
- On low-RAM Android phones, loading a 0.5B model in a browser tab can be slow
  or, on older/low-end devices, fail outright (tab crash / OOM). There's no
  automatic fallback to a smaller model — if this turns out to be a problem
  for your users, swap `MODEL_ID` in the module script for something like
  `HuggingFaceTB/SmolLM2-360M-Instruct`, at a further cost to output quality.

## What actually got better
After the first download, the model is cached by the browser (Cache Storage
API, managed by Transformers.js itself, not by `sw.js`) and **analysis works
fully offline** from then on — a real improvement over the API-key version,
where every save needed a live connection.

Recording still doesn't: `webkitSpeechRecognition` streams audio to Google's
speech servers over the network regardless of PWA status, and iOS Safari
doesn't implement it at all. Those two limitations are unchanged from before,
and packaging can't fix either one.

## sw.js note
`sw.js` was updated to only ever delete its **own** old cache versions
(`voxiq-shell-*`) during `activate`. The earlier version deleted *any* cache
that wasn't its own name — which would have wiped the model's ~300MB cache
(stored under a different name by Transformers.js) on every service worker
update, forcing a silent re-download. Worth knowing if you fork this further:
don't broaden that cleanup filter back out.
