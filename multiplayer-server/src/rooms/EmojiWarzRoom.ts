import { Room, Client } from "@colyseus/core";
import { EmojiWarzState, Player } from "./schema/EmojiWarzState";

/**
 * Host-relay co-op room for Emoji Warz.
 *
 * The first player to join is the "host": their browser runs the game's
 * normal single-player simulation (wave spawning, enemy AI, boss cutscenes)
 * completely unmodified, and streams a compact snapshot of it to everyone
 * else a few times a second via the `host_sync` message. Guests move their
 * own hero locally and report attacks back through this room; the host
 * resolves them authoritatively and the result flows back out on the next
 * snapshot. This room is intentionally "dumb" — it stores player state and
 * relays a handful of message types, it does not simulate the battle itself.
 *
 * PvP is not implemented yet. `state.mode` and the commented handler below
 * are left in place so a competitive arena can reuse this same room/schema
 * without changing the protocol other clients already speak.
 */
export class EmojiWarzRoom extends Room<EmojiWarzState> {
    maxClients = 4;
    private hostSessionId: string | null = null;

    onCreate(options: any) {
        this.setState(new EmojiWarzState());
        this.state.mode = options?.mode === "pvp" ? "pvp" : "coop";

        // A player's own position/HP, synced to everyone via room state.
        this.onMessage("player_update", (client, data) => {
            const p = this.state.players.get(client.sessionId);
            if (!p) return;
            if (typeof data?.x === "number") p.x = data.x;
            if (typeof data?.y === "number") p.y = data.y;
            if (typeof data?.hp === "number") p.hp = data.hp;
            if (typeof data?.maxHp === "number") p.maxHp = data.maxHp;
        });

        this.onMessage("ready", (client) => {
            const p = this.state.players.get(client.sessionId);
            if (p) p.ready = true;
        });

        // Only the host may start the match.
        this.onMessage("start_game", (client) => {
            if (client.sessionId !== this.hostSessionId || this.state.started) return;
            this.state.started = true;
            this.broadcast("game_started", {});
        });

        // Host -> everyone else: authoritative enemy/wave snapshot.
        this.onMessage("host_sync", (client, data) => {
            if (client.sessionId !== this.hostSessionId) return;
            this.broadcast("host_sync", data, { except: client });
        });

        // Guest -> host: "I hit this enemy for this much." Only the host
        // resolves damage, so this is relayed to the host client only.
        this.onMessage("attack", (client, data) => {
            if (client.sessionId === this.hostSessionId) return;
            const host = this.clients.find(c => c.sessionId === this.hostSessionId);
            if (host) host.send("attack", { ...data, senderId: client.sessionId });
        });

        // Host -> a specific guest: "an enemy just hit you for this much."
        this.onMessage("damage_player", (client, data) => {
            if (client.sessionId !== this.hostSessionId) return;
            const target = this.clients.find(c => c.sessionId === data?.targetId);
            if (target) target.send("damage_player", { amount: data.amount });
        });

        // Host -> a specific guest: "you get credit/points for that kill."
        this.onMessage("reward_player", (client, data) => {
            if (client.sessionId !== this.hostSessionId) return;
            const target = this.clients.find(c => c.sessionId === data?.targetId);
            if (target) target.send("reward_player", { points: data.points });
        });

        // Simple chat/emote relay.
        this.onMessage("chat", (client, data) => {
            const p = this.state.players.get(client.sessionId);
            this.broadcast("chat", { name: p?.name || "Player", text: String(data?.text || "").slice(0, 140) });
        });

        // ---- Reserved for a future PvP arena mode ----
        // this.onMessage("attack_player", (client, data) => {
        //     // Would need its own authority model (likely host-resolved,
        //     // same as `attack` above) plus hit-range validation.
        // });
    }

    onJoin(client: Client, options: any) {
        const p = new Player();
        p.name = String(options?.name || "Player").slice(0, 16);
        p.hero = String(options?.hero || "balanced");
        if (!this.hostSessionId) {
            this.hostSessionId = client.sessionId;
            p.isHost = true;
        }
        this.state.players.set(client.sessionId, p);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
        if (client.sessionId === this.hostSessionId) {
            // Host migration: hand the role to whoever's left. The new
            // host's client resumes the simulation at the current level;
            // guests just keep receiving snapshots from the new source.
            const next = this.clients[0];
            this.hostSessionId = next ? next.sessionId : null;
            if (next) {
                const np = this.state.players.get(next.sessionId);
                if (np) np.isHost = true;
                next.send("became_host", {});
            }
        }
    }
}
