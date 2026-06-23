# Fieldnotes Canvas

A mobile-first research canvas built with React, Tailwind CSS, Vite, and Cloudflare Pages.

## Current scope

- Responsive three-panel desktop workspace and focused mobile panel navigation
- Virtualized canvas directory, local chat prototype, and save-to-resource affordances
- Editable Markdown-style notes, resource ingestion UI, threaded comments, and anchored annotations
- Deep links for resources, comments, and annotations
- Provider-neutral media storage interface with a Cloudinary adapter
- Installable PWA with an app-shell cache and offline font cache

The OpenRouter chat, signed Cloudinary upload endpoint, Titan Embeds, persistence, and ingestion pipelines are intentionally represented as integration boundaries rather than fake production implementations.

## Local development

Install dependencies and start Vite:

```sh
npm install
npm run dev
```

Create a production bundle:

```sh
npm run build
```

Deploy the built `dist` directory to Cloudflare Pages:

```sh
npm run deploy
```

## Production architecture

Keep provider secrets and signing on Cloudflare Workers/Pages Functions. The browser should only receive short-lived signed upload parameters. Put OpenRouter behind a Worker endpoint with authenticated per-user and per-IP rate limits, bounded prompt/context sizes, request timeouts, and streaming cancellation.

Use D1 for canvases, comments, resource metadata, permissions, and durable rate-limit records; R2 or Cloudinary for binary media; Queues for article extraction/transcription; and Cache API/KV for normalized link previews and immutable reads. Cursor pagination feeds virtualized lists without loading full collections. Resource and comment identifiers are stable so deep links remain valid when lists reorder.

The `MediaStorage` interface in `src/services/media.ts` keeps the application independent of Cloudinary. A replacement provider only needs to implement upload, removal, and delivery URL generation.
