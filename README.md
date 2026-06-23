# Fieldnotes

The research chat uses OpenRouter's `openrouter/free` router, which only selects from currently available free models. An OpenRouter API key is still required for access and rate limiting.

## 1. Create the Discord bot

1. Open <https://discord.com/developers/applications> and select **New Application**.
2. Open **Bot**, create the bot, copy its token, and enable **Message Content Intent**.
3. Open **OAuth2 → General → Redirects**, add this exact redirect URL, and select **Save Changes**:

```text
http://localhost:5173/api/discord/callback
```

Use the same hostname you use to open the site. If you browse to `http://127.0.0.1:5173`, register `http://127.0.0.1:5173/api/discord/callback` instead. Discord treats `localhost` and `127.0.0.1` as different redirect URLs.

### Fix `Invalid OAuth2 redirect_uri`

The Discord account connecting Fieldnotes does **not** need to own the bot. It must own the Discord server or have **Manage Server** permission there.

If Discord displays `Invalid OAuth2 redirect_uri`:

1. Check that `DISCORD_CLIENT_ID` in `.dev.vars` is the **Application ID** of the same Discord application you are editing.
2. In that application, open **OAuth2 → General → Redirects**.
3. Add exactly `http://localhost:5173/api/discord/callback` with no trailing slash.
4. Select **Save Changes** in the Discord Developer Portal.
5. Open Fieldnotes at exactly `http://localhost:5173`, not `127.0.0.1`, another port, or a LAN address.
6. Restart the site with `npm run dev`.

For another origin, register that exact origin followed by `/api/discord/callback`. For example, if Fieldnotes opens at `http://127.0.0.1:5173`, register `http://127.0.0.1:5173/api/discord/callback`.

### Fix `Discord authorization failed`

This means Discord accepted the redirect but rejected the authorization-code exchange:

1. Open the same application in the Discord Developer Portal.
2. Copy **General Information → Application ID** into `DISCORD_CLIENT_ID` in `.dev.vars`.
3. Open **OAuth2 → General**, reset or copy **Client Secret**, and put it in `DISCORD_CLIENT_SECRET`.
4. Do not use the bot token, public key, or generated bridge secret as the client secret.
5. Do not wrap either value in quotes or add spaces.
6. Restart `npm run dev` and begin a new authorization attempt; an old OAuth code cannot be reused.

The local error response includes Discord's specific reason, such as `invalid_client` or `invalid_grant`.

### Fix local `SQLITE_BUSY` alarm errors

Run only one Fieldnotes development server at a time. Stop every existing `npm run dev` process, then start one fresh process. The OAuth cleanup alarm uses bounded key deletion; if an older development process remains active, it can still hold the local Durable Objects SQLite database lock.

If `SQLITE_BUSY` continues after all site servers are stopped, preserve and reset the local Workerd state:

```sh
mv .wrangler/state .wrangler/state.backup
npm run dev
```

Only do this while every Fieldnotes site server is stopped. This resets local-only Durable Object data, so reconnect the canvas to its Discord channel afterward. The previous state remains available in `.wrangler/state.backup`; production data is unaffected. The Discord bridge is a separate process and does not lock this database.

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
```

Put the same Discord token and bridge secret in `services/discord-bridge/.env`:

```text
DISCORD_BOT_TOKEN=...
FIELDNOTES_API_URL=http://localhost:5173
FIELDNOTES_BRIDGE_SECRET=<same generated secret>
PORT=8080
```

For local development, the bridge also loads `DISCORD_BOT_TOKEN` and `DISCORD_BRIDGE_SECRET` directly from the repository-root `.dev.vars` when they are absent from its own `.env`. Values in `services/discord-bridge/.env` take precedence. Docker and production inject these values through normal process environment variables; Wrangler does not load `.dev.vars` into a separate Node process.

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

Use **Sign in with Discord** in the site header to attach your Discord display name and avatar to messages sent from the website chat. The sign-in lasts for 30 days. Without Discord sign-in, the site uses a stable `Guest-XXXXXX` identity derived from the browser's locally stored device ID.

1. Open the canvas’s **Chat · Discord** tab.
2. Select **Connect Discord**.
3. Authorize Discord in the new browser tab. It returns automatically to the original canvas, where you choose a server you manage.
4. If the bot is already installed, select a channel or thread and the canvas is linked immediately.
5. If the bot is missing, select **Add bot**, finish Discord’s installation flow, return to Fieldnotes, and select **Retry**.

Discord's supported OAuth flow runs in a web browser, not inside the Discord desktop app. If Discord asks you to sign in, sign in on that browser once; future authorizations can reuse its Discord session. The site cannot safely force the OAuth flow into the desktop client.

The slash command remains available as a fallback:

```text
/canvas-link canvas-id:<CANVAS_ID>
```

Messages will now synchronize in both directions.

You can type an ordinary message in the linked Discord channel or thread; the bot does not need to be mentioned. Messages from human Discord users are forwarded to the app. Messages created by bots and webhooks are intentionally ignored to prevent synchronization loops.

For Discord → Fieldnotes synchronization, the bridge must remain running in a second terminal and display `discord_ready`:

```sh
cd services/discord-bridge
npm run dev
```

After a Discord message, the bridge should print `discord_event_forwarded` with `{"accepted":true}`. If it prints `{"ignored":true,"reason":"Channel is not linked"}`, reconnect the canvas to that exact channel or thread. If it prints nothing, enable **Message Content Intent** under Discord Developer Portal → **Bot**, confirm the bot can view that channel, and restart the bridge.

Inspect the running bridge from another terminal:

```sh
curl http://localhost:8080
```

`ok` must be `true` and `guildCount` must be at least `1`. After typing a human message in the linked channel, `lastGatewayMessage` and `lastForward` must be populated. A missing `lastGatewayMessage` means Discord did not deliver the event to the bridge; a populated `lastGatewayMessage` with an error or ignored result in `lastForward` identifies the Worker-side failure.

## 5. Deploy the site

Create the queue once:

```sh
npx wrangler login
npx wrangler queues create fieldnotes-discord-outbound
```

Add production secrets from `.dev.vars` in one shot:

```sh
npx wrangler secret bulk .dev.vars
```

Before deploying, also add `https://<YOUR_DEPLOYED_SITE>/api/discord/callback` under **Discord Developer Portal → OAuth2 → General → Redirects**. The Worker derives this URL from the current site origin; no redirect URL environment variable is required.

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
