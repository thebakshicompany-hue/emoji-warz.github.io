import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
    @type("string") name: string = "Player";
    @type("string") hero: string = "balanced";
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("boolean") isHost: boolean = false;
    @type("boolean") ready: boolean = false;
    @type("number") kills: number = 0;
}

export class EmojiWarzState extends Schema {
    // "coop" today; "pvp" is reserved for a future competitive arena mode.
    @type("string") mode: string = "coop";
    @type("boolean") started: boolean = false;
    @type({ map: Player }) players = new MapSchema<Player>();
}
