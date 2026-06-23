# Fieldnotes

## 1. Create the Discord bot

1. Open <https://discord.com/developers/applications> and select **New Application**.
2. Open **Bot**, create the bot, copy its token, and enable **Message Content Intent**.
3. Open **OAuth2 → General** and add this redirect URL for local development:

```text
http://localhost:5173/api/discord/callback
```

4. Open **OAuth2 → URL Generator**.
5. Select the `bot` and `applications.commands` scopes.
6. Select these bot permissions:
   - View Channels
   - Read Message History
   - Send Messages
   - Send Messages in Threads
   - Embed Links
   - Attach Files
7. Optionally open the generated URL and install the bot now. The in-site connection flow can also install it later.

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

### Where every variable comes from

| Variable | Where to get it |
|---|---|
| `OPENROUTER_API_KEY` | Create a key at <https://openrouter.ai/settings/keys>. |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Console → **Dashboard** → **Product Environment Credentials** → Cloud name. |
| `CLOUDINARY_API_KEY` | Cloudinary Console → **Dashboard** → **Product Environment Credentials** → API Key. |
| `CLOUDINARY_API_SECRET` | Cloudinary Console → **Dashboard** → **Product Environment Credentials** → reveal/copy API Secret. |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → your application → **Bot** → **Reset Token** or **Copy Token**. Use the same token in both environment files. |
| `DISCORD_BRIDGE_SECRET` | Generate it yourself with `openssl rand -hex 32`. Use the exact same generated value in both environment files. |
| `DISCORD_CLIENT_ID` | Discord Developer Portal → your application → **General Information** → Application ID. |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → your application → **OAuth2 → General** → Client Secret. Reset it if Discord has not shown one yet. |
| `DISCORD_OAUTH_REDIRECT_URI` | You choose this URL. Locally use `http://localhost:5173/api/discord/callback`. In production use `https://YOUR_SITE_DOMAIN/api/discord/callback`. Add the exact same URL under Discord Developer Portal → **OAuth2 → General → Redirects**. |
| `FIELDNOTES_API_URL` | The base URL of this site, without a trailing slash. Locally use `http://localhost:5173`; in production use `https://YOUR_SITE_DOMAIN`. |
| `PORT` | The Discord bridge health-check port. Leave it as `8080` unless your container host requires another value. |

Cloudinary credentials are available at <https://console.cloudinary.com/>. Discord application credentials are available at <https://discord.com/developers/applications>.

Put your credentials in `.dev.vars`:

```text
OPENROUTER_API_KEY=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
DISCORD_BOT_TOKEN=...
DISCORD_BRIDGE_SECRET=<generated secret>
DISCORD_CLIENT_ID=<Discord application ID>
DISCORD_CLIENT_SECRET=<OAuth2 client secret>
DISCORD_OAUTH_REDIRECT_URI=http://localhost:5173/api/discord/callback
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
2. Select **Connect Discord**.
3. Authorize Discord and choose a server you manage.
4. If the bot is already installed, select a channel or thread and the canvas is linked immediately.
5. If the bot is missing, select **Add bot**, finish Discord’s installation flow, return to Fieldnotes, and select **Retry**.

The slash command remains available as a fallback:

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
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_OAUTH_REDIRECT_URI
```

Before deploying, also add `https://<YOUR_DEPLOYED_SITE>/api/discord/callback` under **Discord Developer Portal → OAuth2 → General**, and use that exact URL for `DISCORD_OAUTH_REDIRECT_URI`.

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
