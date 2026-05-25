# Professional preview password gate

Temporary client-side gate for the professional navigator layer while it is evaluated before launch.

## What is protected

- `/professionals.html`, `/boards.html`, `/report-outdated.html`, `/regional-snapshot.html`, `/changelog.html`, `/export.html`
- Homepage navigator mode: `/?mode=navigator` (and presets such as `?mode=navigator&preset=…`)

Family search (`/`) without `?mode=navigator` stays open.

## Password

The preview password is stored only as a SHA-256 hash in `public/data/pro_gate.json` (not plaintext in the repo). Change it with the hash command below before sharing widely.

## Change or disable the gate

Edit `public/data/pro_gate.json`:

```json
{
  "enabled": true,
  "password_sha256": "<64-char hex sha256 of your password>",
  "hint": "Contact the site owner for preview access."
}
```

Set `"enabled": false` to remove the gate entirely (e.g. at launch).

Generate a new hash:

```bash
node -e "const c=require('crypto'); console.log(c.createHash('sha256').update('YOUR_PASSWORD').digest('hex'))"
```

Then run `npm run build` and redeploy.

## How it works

- Unlock is stored in `sessionStorage` (`vmhr_pro_gate_v1`) for the browser tab session.
- This is **not** strong security—anyone can read the hash in the repo or bypass in devtools. It only deters casual visitors during preview.

## Tests

Playwright uses `unlockProGate()` in `tests/helpers/ui.js` to set session storage before visiting pro pages.
