# Fieldnotes

## Local setup

```sh
npm install
cp .dev.vars.example .dev.vars
cp .env.example .env.local
```

Add your OpenRouter and Cloudinary credentials to `.dev.vars`, then run:

```sh
npm run dev
```

## Deploy

```sh
npx wrangler login
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put CLOUDINARY_CLOUD_NAME
npx wrangler secret put CLOUDINARY_API_KEY
npx wrangler secret put CLOUDINARY_API_SECRET
npm run deploy
```
