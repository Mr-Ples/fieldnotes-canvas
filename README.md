# Fieldnotes

## 1. Create the Discord bot

1. Open <https://discord.com/developers/applications> and select **New Application**.
2. Open **Bot**, create the bot, copy its token, and enable **Message Content Intent**.
3. Open **OAuth2 → URL Generator**.
4. Select the `bot` and `applications.commands` scopes.
5. Select these bot permissions:
   - View Channels
   - Read Message History
   - Send Messages
   - Send Messages in Threads
   - Embed Links
   - Attach Files
6. Open the generated URL and install the bot in your Discord server.

## 2. Configure the project

```sh
npm install
cp .dev.vars.example .dev.vars
cd services/discord-bridge
npm install
cp .env.example .env
cd ../..
openssl rand -hex 32
```

Put your credentials in `.dev.vars`:

```text
OPENROUTER_API_KEY=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
DISCORD_BOT_TOKEN=...
DISCORD_BRIDGE_SECRET=<generated secret>
```

Put the same Discord token and bridge secret in `services/discord-bridge/.env`:

```text
DISCORD_BOT_TOKEN=...
FIELDNOTES_API_URL=http://localhost:5173
FIELDNOTES_BRIDGE_SECRET=<same generated secret>
PORT=8080
```

## 3. Run locally

Run the site:

```sh
npm run dev
```

In another terminal, run the Discord bridge:

```sh
cd services/discord-bridge
npm run dev
```

If the site is not running on port 5173, update `FIELDNOTES_API_URL` in the bridge `.env`.

## 4. Link a canvas to Discord

1. Open the canvas’s **Chat · Discord** tab.
2. Copy its displayed canvas ID.
3. In the Discord channel or thread you want to synchronize, run:

```text
/canvas-link canvas-id:<CANVAS_ID>
```

Messages will now synchronize in both directions.

## 5. Deploy the site

Create the queue once:

```sh
npx wrangler login
npx wrangler queues create fieldnotes-discord-outbound
```

Add production secrets interactively:

```sh
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put CLOUDINARY_CLOUD_NAME
npx wrangler secret put CLOUDINARY_API_KEY
npx wrangler secret put CLOUDINARY_API_SECRET
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_BRIDGE_SECRET
```

Deploy:

```sh
npm run deploy
```

## 6. Deploy the Discord bridge

Build its container:

```sh
docker build -t fieldnotes-discord-bridge services/discord-bridge
```

Deploy that image to an always-running container host with:

```text
DISCORD_BOT_TOKEN=...
FIELDNOTES_API_URL=https://<YOUR_DEPLOYED_SITE>
FIELDNOTES_BRIDGE_SECRET=<same production secret>
PORT=8080
```

To run the container locally:

```sh
docker run --env-file services/discord-bridge/.env -p 8080:8080 fieldnotes-discord-bridge
```
