# Emoji Warz — multiplayer + premium backend

This folder is **not** a standalone app you run — it's a drop-in patch for the
Colyseus server already deployed at your Hugging Face Space
(`https://huggingface.co/spaces/vbnm1bbg/matheybackend`). That Space currently
runs an unrelated math-quiz room (`my_room`); these files add a second room,
`emoji_warz`, for Emoji Warz co-op, plus one HTTP endpoint used by the
optional Razorpay premium unlock. The existing math room is left untouched.

## What's in here

```
src/
  app.config.ts              # registers the new room + the payment-verify route
  rooms/
    EmojiWarzRoom.ts          # the co-op relay room (see comments inside)
    schema/EmojiWarzState.ts  # networked state (players list, mode, started)
```

## Why the game can't just "have" multiplayer without this

The frontend (this repository) is a static site with nowhere to run
server-authoritative game logic or hold a Razorpay secret key. Colyseus
rooms and the payment-signature check both have to run somewhere with a
private key/secret, which is exactly what your HF Space already is.

## Deploy steps

1. Clone your Space's repo (it's a normal git remote):
   ```bash
   git clone https://huggingface.co/spaces/vbnm1bbg/matheybackend
   cd matheybackend
   ```
2. Copy these files in, overwriting only `src/app.config.ts` (the rest are
   new files, nothing else in the Space is touched):
   ```bash
   cp /path/to/this/multiplayer-server/src/app.config.ts src/app.config.ts
   cp /path/to/this/multiplayer-server/src/rooms/EmojiWarzRoom.ts src/rooms/
   mkdir -p src/rooms/schema
   cp /path/to/this/multiplayer-server/src/rooms/schema/EmojiWarzState.ts src/rooms/schema/
   ```
3. Make sure `cors` is in `package.json` dependencies (it already should be,
   per the template) — `app.config.ts` now imports it directly.
4. **If you're wiring up the premium unlock:** in the Space's Settings →
   "Variables and secrets", add a **secret** named `RAZORPAY_KEY_SECRET` with
   your Razorpay Key Secret. Never put this in a file you commit or in any
   client-side code — it's what makes the payment-verification endpoint
   trustworthy. If you're not using premium/Razorpay, you can skip this; the
   endpoint just responds `server_not_configured` and the game's premium
   modal explains payments aren't set up yet.
5. Commit and push — Hugging Face Spaces rebuilds automatically on push:
   ```bash
   git add -A
   git commit -m "Add Emoji Warz co-op room and payment verification"
   git push
   ```
6. Once it's "Running" again, the room is reachable at
   `wss://vbnm1bbg-matheybackend.hf.space` (room name `emoji_warz`), and the
   payment endpoint at `https://vbnm1bbg-matheybackend.hf.space/verify-payment-link`.
   Both URLs are already set as defaults in `multiplayer.js` and
   `premium.js` in the game's root — edit them there if your Space's URL
   ever changes.

## Setting up the Razorpay side (only needed for premium)

1. In the Razorpay Dashboard, create a **Payment Link** for the amount you
   want to charge (₹49 was the number discussed for this game).
2. In that link's advanced settings, turn on **"Redirect after payment"**
   and set the redirect URL to this game's own deployed URL (e.g. your
   GitHub Pages URL). Razorpay appends `razorpay_payment_id`,
   `razorpay_payment_link_id`, `razorpay_payment_link_reference_id`,
   `razorpay_payment_link_status`, and `razorpay_signature` as query params
   automatically — the game reads these on load (`premium.js`) and calls
   `/verify-payment-link` to confirm they're genuine before unlocking
   anything.
3. Put the Payment Link's URL into `PAYMENT_LINK_URL` in `premium.js` (in
   the game's root, not this folder).
4. Add `RAZORPAY_KEY_SECRET` as a Space secret as described above. That's
   the only credential the server needs; the Payment Link URL itself is
   public/safe to embed in client code.

## Known limitations (v1, by design — see comments in the code for more)

- **Host-relay co-op, not full server authority.** The player who
  creates/first-joins a match runs the actual simulation (waves, enemy AI,
  boss cutscenes) locally, exactly like single-player; the server just
  relays a snapshot of it plus a few messages. This reuses ~all of the
  existing single-player combat code, but means a host with a bad
  connection affects everyone, and a determined cheater could tamper with
  their own client's damage numbers (fine for a casual co-op game; not
  meant to resist competitive cheating).
- **Host migration is simple.** If the host leaves, the next player
  becomes host and the run continues from the current level, but any
  enemies mid-flight are dropped and a fresh wave begins.
- **PvP is not implemented.** `state.mode` and a commented `attack_player`
  handler are left in `EmojiWarzRoom.ts` so a competitive arena mode can be
  added later without changing what the other messages mean.
- **Premium unlock is per-browser**, stored in `localStorage` — consistent
  with this game having no login/accounts. It doesn't sync across devices.
