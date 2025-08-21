# moderaction (skeleton)

Modern Forumactif moderation plugin – **embedded script** you can drop into a forum template.

## Quick start

```bash
pnpm i      # or npm i / yarn
pnpm dev    # builds on watch + serves /dist on http://localhost:8080
```

Open `examples/index.html` in your browser (served from `/dist`) to test the IIFE build.

## Builds

- `dist/moderaction.iife.js` – exposes `window.Moderaction` (for `<script>` embed)
- `dist/moderaction.esm.js` – ESM export (for advanced setups)

## Files to edit

- `src/actions/topics.ts` – example actions (lock/unlock)
- `src/adapters/phpbb3.ts` – selector/endpoint adapter for a common Forumactif skin
- `src/core/request.ts` – fetch wrapper that adds `tid` & handles charset
- `src/index.ts` – public API surface
