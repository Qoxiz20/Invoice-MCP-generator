# Invoice Generator — LHG Import Export Hub

Phase 2 of the WhatsApp order automation project: structured order → HTML → PDF.

## Current status

- ✅ Phase 1: Product catalog (`catalog.json`) — done. 28 items loaded, only
  **Royal Lion Potato Starch** has full pricing; everything else is flagged
  `needs_review` until the Excel is filled in and re-converted.
- ✅ Phase 2: Invoice generator — done. Products are matched by free-text
  query (e.g. "button mushroom"), not barcode — barcode is an optional
  internal shortcut. Ambiguous or unmatched queries throw a clear error
  with candidates instead of guessing.
- ✅ Phase 3: Google Drive upload — done. PDFs auto-upload to
  `Invoices/{year}/{month}/` in Google Drive, auto-creating subfolders.
- ⬜ Phase 4: WhatsApp webhook — not started.
- ⬜ Phase 5: AI order parsing — not started.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` with your Supabase project URL and service key, and your
Google Drive service account key path + folder ID.

For Google Drive (OAuth):
1. In Google Cloud Console → APIs & Services → Credentials → Create
   Credentials → OAuth client ID → type "Desktop app".
2. Copy the Client ID and Client Secret into `.env`.
3. Run `node get-refresh-token.js` once — it prints a URL, you approve
   access in your browser, paste back a code, and it prints your
   `GOOGLE_OAUTH_REFRESH_TOKEN`. Copy that into `.env`.
4. Share your Drive "Invoices" root folder with the Google account you
   authorized in step 3 (or just use that account's own Drive directly).
5. Copy that folder's ID from its URL into `GOOGLE_DRIVE_FOLDER_ID`.

You also need to run this SQL once in your Supabase project (SQL editor):

```sql
create table invoice_counters (
  year int not null,
  month int not null,
  last_number int not null default 0,
  primary key (year, month)
);

create or replace function get_next_invoice_number(p_year int, p_month int)
returns int as $$
declare
  next_num int;
begin
  insert into invoice_counters (year, month, last_number)
  values (p_year, p_month, 1)
  on conflict (year, month)
  do update set last_number = invoice_counters.last_number + 1
  returning last_number into next_num;
  return next_num;
end;
$$ language plpgsql;
```

## Usage

```js
const { generateInvoice } = require('./generate-invoice');

const order = {
  customer_name: 'ABC Restaurant',
  customer_address: '123 Jalan Test, Kota Kinabalu, Sabah',
  customer_phone: '+60 12-345 6789',
  payment_method: 'Bank Transfer',
  items: [
    { barcode: '9551029670183', quantity: 2 } // barcode must exist + be priced in catalog.json
  ],
};

generateInvoice(order).then((result) => {
  console.log(result.invoiceNumber, result.outputPath);
});
```

Or run the built-in test:

```bash
npm run generate
```

**Note:** the test order in `generate-invoice.js` currently has an empty items
list, because Royal Lion Potato Starch (the only fully-priced item) is
missing its barcode in the Excel. Running it as-is will fail on purpose
with "Order has no items" — that's the fail-safe behavior working correctly,
not a bug. Fill in a barcode + quantity once at least one product is fully
priced with a barcode, to see a real PDF generated.

## How pricing works

Tier is selected automatically from quantity ordered:

| Quantity | Tier |
|---|---|
| 1–3 | `1-3_unit` |
| 4–10 | `4-10_unit` |
| 11–20 | `11-20_unit` |
| 21–49 | `21-49_unit` |
| 50+ | `50_unit_plus` |

If the matched tier has no price in `catalog.json`, or the barcode doesn't
exist, generation **stops and throws** — it never guesses or generates a
partial invoice.

## Updating the catalog

1. Edit the master Excel.
2. Send it back through Claude to regenerate `catalog.json`.
3. Replace `catalog.json` in this project.

## Folder structure

```
invoice-generator/
├── generate-invoice.js   # main entry point (plain Node, unrelated to Next.js/Vercel)
├── invoice-template.html # FIXED invoice design — edit freely, placeholders must stay
├── catalog.json          # product data — regenerate from Excel, don't hand-edit
├── next.config.js         # minimal Next.js config
├── src/
│   ├── catalog.js        # catalog loading + lookup
│   ├── pricing.js         # tier selection + line/total calculations
│   ├── counter.js         # Supabase-backed running invoice number
│   ├── render.js           # fills HTML template with order data
│   ├── pdf.js              # HTML → PDF via Puppeteer
│   ├── auth.js             # shared Google OAuth client (Drive + Sheets, server-side refresh flow)
│   ├── drive.js             # invoice PDF upload to Drive
│   ├── sheetsTools.js       # MCP tools: read/write/append Google Sheets cells
│   ├── mcpDriveTools.js     # MCP tools: move files in Drive
│   └── whatsappTools.js     # MCP tool: send WhatsApp message (inactive until Meta approval)
├── lib/
│   ├── jwt.js               # sign/verify all tokens this app issues (auth codes, access, refresh, relay state)
│   ├── pkce.js               # PKCE S256 verification
│   └── google-identity.js    # Google login used ONLY for identity check inside /api/authorize
├── app/
│   ├── api/
│   │   ├── mcp/route.js              # the 6 MCP tools, protected by withMcpAuth
│   │   ├── authorize/route.js         # OAuth /authorize — hands off to Google for identity
│   │   ├── oauth/google/callback/route.js  # Google redirects back here; mints our own auth code
│   │   └── token/route.js              # OAuth /token — issues our own access/refresh tokens
│   └── .well-known/
│       ├── oauth-protected-resource/route.js     # RFC 9728
│       └── oauth-authorization-server/route.js    # RFC 8414
├── output/                # generated PDFs land here (gitignored)
└── .env                   # secrets — never committed
```

## MCP server — real OAuth 2.1, not a shared secret

This app is deployed as a Next.js project on Vercel and does two unrelated
jobs from the same codebase:

1. **Resource Server** — exposes 6 tools (`sheets_read_range`,
   `sheets_update_range`, `sheets_append_row`, `sheets_list_tabs`,
   `drive_move_file`, `whatsapp_send_message`) at `/api/mcp`, using
   `mcp-handler` v2 + `@modelcontextprotocol/server` v2 (Streamable HTTP).
2. **Authorization Server** — issues the tokens Claude uses to call those
   tools, at `/api/authorize` and `/api/token`. Google is used *inside*
   this flow only to confirm identity — Google's own access token never
   reaches Claude.

### Why not just use Google directly as the Authorization Server?

Claude requires every access token's `aud` claim to exactly match this
server's canonical URL (RFC 8707 — Claude enforces this as a MUST). Google's
OAuth server doesn't support resource-scoped tokens — it always audiences
tokens to its own Client ID, never to an arbitrary URL. Passing a raw
Google token to Claude would fail Claude's audience check outright. So this
app mints its own resource-bound tokens instead, using Google only as a
one-time login check inside `/api/authorize`.

### The flow

```
Claude → GET /api/mcp (no token)
       ← 401 + WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource"

Claude → GET /.well-known/oauth-protected-resource
       ← { resource: ".../api/mcp", authorization_servers: [".../"] }

Claude → GET /.well-known/oauth-authorization-server  (on OUR domain, not Google's)
       ← { authorization_endpoint: ".../api/authorize", token_endpoint: ".../api/token", ... }

Claude → browser opens GET /api/authorize?client_id=...&code_challenge=...&resource=...
       → we redirect to Google's real login screen (identity check only)
       ← Google redirects back to /api/oauth/google/callback with a Google code
       → we exchange it, read the email, check it against ALLOWED_GOOGLE_EMAIL
       → we mint OUR OWN short-lived authorization code, redirect back to Claude

Claude → POST /api/token  (grant_type=authorization_code, our code + PKCE verifier)
       ← { access_token: <our JWT, aud=.../api/mcp>, refresh_token: <our JWT> }

Claude → POST /api/mcp  Authorization: Bearer <our access token>
       → withMcpAuth verifies signature + issuer + audience + scope
       → tool runs exactly as before
```

Two Google OAuth interactions exist in this codebase and never touch each
other: `src/auth.js` (server's own long-lived Drive/Sheets access, used by
both the invoice generator and the MCP tools) and
`lib/google-identity.js` (one-time human login check inside `/api/authorize`
only). Same Google Cloud OAuth Client, two separate purposes.

### Environment variables

All secrets live in Vercel's environment variables — nothing is hardcoded
in source. See `.env.example` for the full annotated list. Summary:

| Variable | Purpose |
|---|---|
| `MCP_ISSUER_URL` | Your app's stable production URL — used to construct every issuer/resource/redirect value consistently |
| `MCP_JWT_SECRET` | Signs every token this app issues. Rotating it revokes everything at once (this design has no per-token revocation) |
| `MCP_CLIENT_ID` / `MCP_CLIENT_SECRET` | Values *you* make up, entered into Claude's "Use your own OAuth client" field |
| `ALLOWED_GOOGLE_EMAIL` | The one Google account allowed to complete login |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` | Reused from the existing Drive/Sheets setup — needs one new redirect URI added (see below) |
| `SUPABASE_URL` / `_SERVICE_KEY`, `WHATSAPP_TOKEN` / `_PHONE_NUMBER_ID` | Unchanged from before |

### Google Cloud Console setup

Add **both** of these to your existing OAuth Client's Authorized redirect URIs
(alongside whatever `get-refresh-token.js` already uses):
```
{MCP_ISSUER_URL}/api/oauth/google/callback
http://localhost:3000/api/oauth/google/callback   (for local testing)
```

### Claude custom connector setup

In Claude's connector dialog → Advanced settings → **"Use your own OAuth client"**:
- Server URL: `{MCP_ISSUER_URL}/api/mcp`
- Client ID: your `MCP_CLIENT_ID` value
- Client Secret: your `MCP_CLIENT_SECRET` value

Claude's own redirect URIs (already whitelisted on Anthropic's side, nothing
for you to configure): `https://claude.ai/api/mcp/auth_callback` and
`https://claude.com/api/mcp/auth_callback`.

### Deploy

```bash
npm install
npm install -g vercel
vercel          # first deploy, get your URL, set MCP_ISSUER_URL to it
vercel --prod   # redeploy after setting all env vars in the dashboard
```

### Local test procedure

Run `npm run dev` (starts on `http://localhost:3000`) with `.env` filled in
and `MCP_ISSUER_URL=http://localhost:3000`.

**1. OAuth discovery**
```bash
curl http://localhost:3000/.well-known/oauth-protected-resource
curl http://localhost:3000/.well-known/oauth-authorization-server
```
Both should return JSON (not 404). Confirm `resource` and `issuer` show
`http://localhost:3000`.

**2. Authorization (needs a real browser — this step logs you into Google)**
Open in a browser:
```
http://localhost:3000/api/authorize?response_type=code&client_id=YOUR_MCP_CLIENT_ID&redirect_uri=http://localhost:3000/callback-test&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&resource=http://localhost:3000/api/mcp
```
(The `code_challenge` above corresponds to verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` — a fixed PKCE test pair, fine for local testing.)
You should be sent to Google's real login screen, then redirected back to
`http://localhost:3000/callback-test?code=...` (that URL will 404 since
there's no real page there — that's fine, just copy the `code` value from
the address bar).

**3. Token issuance**
```bash
curl -X POST http://localhost:3000/api/token \
  -d "grant_type=authorization_code" \
  -d "code=PASTE_CODE_FROM_STEP_2" \
  -d "redirect_uri=http://localhost:3000/callback-test" \
  -d "code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk" \
  -d "client_id=YOUR_MCP_CLIENT_ID" \
  -d "client_secret=YOUR_MCP_CLIENT_SECRET"
```
Should return `access_token`, `refresh_token`, `expires_in: 3600`.

**4. MCP authentication**
```bash
# Without a token - should get 401 with WWW-Authenticate header
curl -i -X POST http://localhost:3000/api/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{}}'

# With the access token from step 3 - should succeed
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer PASTE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{}}'
```

**5. Calling each tool** — list them first, then call one as a smoke test:
```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer PASTE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2,"params":{}}'

curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer PASTE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"sheets_list_tabs","arguments":{"spreadsheetId":"YOUR_TEST_SHEET_ID"}}}'
```
Repeat for `sheets_read_range`, `sheets_update_range`, `sheets_append_row`,
`drive_move_file`, and `whatsapp_send_message` (the last will return its
"not yet configured" message until `WHATSAPP_TOKEN` is set — that's expected).

