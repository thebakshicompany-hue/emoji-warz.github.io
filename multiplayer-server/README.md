# Emoji Warz — multiplayer backend

This folder is **not** a standalone app you run — it's a drop-in patch for the
Colyseus server already deployed at your Hugging Face Space
(`https://huggingface.co/spaces/vbnm1bbg/matheybackend`). That Space currently
runs an unrelated math-quiz room (`my_room`); these files add a second room,
`emoji_warz`, for Emoji Warz co-op. The existing math room is left untouched.

(An earlier version of this also added a Razorpay payment-verification
endpoint for a premium unlock. That idea was dropped — the game has no paid
features anymore — so this folder is co-op-only now.)

## What's in here

```
src/
  app.config.ts              # registers the new room
  rooms/
    EmojiWarzRoom.ts          # the co-op relay room (see comments inside)
    schema/EmojiWarzState.ts  # networked state (players list, mode, started)
```

## Why the game can't just "have" multiplayer without this

The frontend (this repository) is a static site with nowhere to run
server-authoritative game logic. A Colyseus room has to run somewhere with a
persistent process, which is exactly what your HF Space already is.

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
   per the template) — `app.config.ts` imports it directly.
4. Commit and push — Hugging Face Spaces rebuilds automatically on push:
   ```bash
   git add -A
   git commit -m "Add Emoji Warz co-op room"
   git push
   ```
5. Once it's "Running" again, the room is reachable at
   `wss://vbnm1bbg-matheybackend.hf.space` (room name `emoji_warz`). That
   URL is already set as the default in `multiplayer.js` in the game's
   root — edit it there if your Space's URL ever changes.

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
