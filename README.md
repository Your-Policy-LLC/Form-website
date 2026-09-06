# Form-website

Embeddable insurance quote form for Your Policy agency websites.

Live: `https://form-website-production.up.railway.app`
Leads are stored in Postgres and posted to Slack.

---

## Adding the form to a website

### 1. Register the site

Edit `src/sites.js` and add an entry:

```js
'larsen-flynn': {
  label: 'Larsen Flynn',
  allowedOrigins: [
    'https://larsenflynn.wpenginepowered.com',
    'https://larsenflynn.com',
    'https://www.larsenflynn.com',
  ],
},
```

- **Key** is the slug. Lowercase, hyphenated. It appears in the embed snippet
  on the public page, so it is not secret.
- **label** is what producers read at the top of every lead in Slack. Use the
  agency's real name, not the hosting install's name.
- **allowedOrigins** controls where the form is permitted to display.

### 2. Get allowedOrigins right, or the form renders blank

This is the single most common failure. An origin is scheme + host + port and
must match **exactly**:

- `https://example.com` and `https://www.example.com` are different origins.
  List both unless you are certain only one is ever served.
- The WP Engine preview host (`*.wpenginepowered.com`) is a different origin
  from the live domain. List both, and add the live domain **before** the site
  cuts over, not after.
- No trailing slash, no path.

### 3. Deploy

Commit to `main`. Railway deploys automatically. Confirm with:

```
curl -s https://form-website-production.up.railway.app/healthz
curl -sD- -o/dev/null https://form-website-production.up.railway.app/f/<slug> | grep -i content-security-policy
```

The second command prints the origins that slug will display on. If a domain
is missing from that list, the form will be blank on it.

### 4. Paste the snippet

```html
<script src="https://form-website-production.up.railway.app/embed.js"
        data-slug="larsen-flynn"></script>
```

**In WordPress this must go in a Custom HTML block.** Pasted into a paragraph
block, or into an Elementor/Divi text widget, the `<script>` tag is silently
stripped and nothing appears. Page builders each have their own HTML or Code
widget — use that one.

### 5. Verify on the live page

Load the page. You should see the form. If you see a red box saying the form
could not be displayed, open the browser console: the error names the slug and
the exact origin of the page, which is what needs adding to `allowedOrigins`.

Then submit a test lead and confirm it appears in Slack with the right site
label. Delete the test row afterwards.

---

## Troubleshooting a blank or broken embed

**Nothing at all on the page, no red box.** The `<script>` tag was stripped.
It is not in a Custom HTML block. This is the most common cause.

**Red box saying the form could not be displayed.** The frame was blocked.
Open the console: the logged origin is the one to add to `allowedOrigins`.
Usually a `www.` mismatch or the WP Engine host.

**Form appears but submitting fails.** Check `/healthz`:
- `"dbReady": false` — the database is unreachable; `migrationError` says why.
- `"slack": "dry-run"` — no `SLACK_BOT_TOKEN` set, leads save but do not notify.
- `"lastNotify": {"ok": false, "reason": "..."}` — Slack rejected the message.
  `channel_not_found` means the bot is not in the channel or the channel ID is
  wrong. `not_in_channel` means invite the bot.

**Lead arrives labelled PREVIEW.** It was submitted at the bare Railway URL
rather than through an embed. That is working as intended.

---

## How attribution works

Two separate facts are recorded on every lead:

- **Site** — which registered slug the form belongs to. Comes from
  `data-slug` in the snippet.
- **page_url** — the actual page the person filled the form out on. Read from
  the host page by `embed.js` and passed into the iframe.

A wrong site label means the wrong `data-slug` was pasted. An empty `page_url`
means the form was used directly rather than embedded.

---

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Reference the Postgres service, do not paste a literal |
| `SLACK_BOT_TOKEN` | for Slack | `xoxb-...`, needs `chat:write` |
| `SLACK_CHANNEL` | for Slack | Channel ID, not `#name`; survives a rename |
| `DEFAULT_SITE_SLUG` | no | Which site the bare domain serves; defaults to `preview` |
| `PORT` | no | Set by Railway; do not set manually |

Nothing is fatal at boot. Missing configuration degrades and is reported on
`/healthz` rather than crash-looping, which produces a bare 502 with no
diagnostic surface.

---

## Known gaps

- Consent text in `src/consent.js` is a **placeholder pending compliance
  review** and is stamped verbatim into every Slack message as the only consent
  record. Must be replaced before production use.
- No retry sweep: if Slack is unreachable when a lead arrives, the row saves
  with `slack_notified_at` null and nothing retries it.
- Site registry is code, not a database. Adding a site needs a deploy.
- The public URL is a Railway-generated hostname. A custom domain should
  replace it before more sites embed the snippet.
