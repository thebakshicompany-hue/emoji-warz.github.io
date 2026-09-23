import crypto from "crypto";
import express from "express";
import cors from "cors";
import config from "@colyseus/tools";
import { monitor } from "@colyseus/monitor";

/**
 * Import your Room files
 */
import { MyRoom } from "./rooms/MyRoom";
import { EmojiWarzRoom } from "./rooms/EmojiWarzRoom";

const isProduction = process.env.NODE_ENV === "production";

export default config({

    initializeGameServer: (gameServer) => {
        console.log("Initializing game server and registering rooms...");
        /**
         * Define your room handlers:
         */
        try {
            gameServer.define('my_room', MyRoom);
            console.log("Room 'my_room' defined.");
        } catch (e) {
            console.error("Error defining room 'my_room':", e);
        }

        try {
            gameServer.define('emoji_warz', EmojiWarzRoom);
            console.log("Room 'emoji_warz' defined.");
        } catch (e) {
            console.error("Error defining room 'emoji_warz':", e);
        }

    },

    initializeExpress: (app) => {
        // Allow this game's own origin(s) to call the endpoints below from the browser.
        // Tighten this to your actual game URL(s) before going live.
        app.use(cors());
        // Needed for the JSON body on POST /verify-payment-link below.
        app.use(express.json());

        /**
         * Bind your custom express routes here:
         * Read more: https://expressjs.com/en/starter/basic-routing.html
         */
        app.get("/hello_world", (req, res) => {
            res.send("It's time to kick ass and chew bubblegum!");
        });

        /**
         * Verifies a Razorpay Payment Link redirect and reports whether the
         * payment was genuine. Stateless by design — Emoji Warz has no user
         * accounts, so the client itself remembers the unlock (localStorage)
         * once this confirms it. RAZORPAY_KEY_SECRET must be set as a secret
         * env var on this Space (Settings -> Variables and secrets) and must
         * NEVER be exposed to the browser.
         *
         * Formula per Razorpay's own Payment Links signature verification:
         *   HMAC_SHA256(payment_link_id + "|" + payment_link_reference_id +
         *               "|" + payment_link_status + "|" + payment_id, key_secret)
         */
        app.post("/verify-payment-link", (req, res) => {
            const secret = process.env.RAZORPAY_KEY_SECRET;
            if (!secret) {
                console.error("RAZORPAY_KEY_SECRET is not set — refusing to verify payments.");
                return res.status(500).json({ valid: false, error: "server_not_configured" });
            }

            const {
                razorpay_payment_id,
                razorpay_payment_link_id,
                razorpay_payment_link_reference_id,
                razorpay_payment_link_status,
                razorpay_signature
            } = req.body || {};

            if (!razorpay_payment_id || !razorpay_payment_link_id || !razorpay_signature) {
                return res.status(400).json({ valid: false, error: "missing_fields" });
            }

            const payload = [
                razorpay_payment_link_id,
                razorpay_payment_link_reference_id || "",
                razorpay_payment_link_status || "",
                razorpay_payment_id
            ].join("|");

            const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

            let signatureMatches = false;
            try {
                signatureMatches = crypto.timingSafeEqual(
                    Buffer.from(expected, "hex"),
                    Buffer.from(String(razorpay_signature), "hex")
                );
            } catch {
                signatureMatches = false; // malformed signature string
            }

            const valid = signatureMatches && razorpay_payment_link_status === "paid";
            res.json({ valid });
        });

        /**
         * Use @colyseus/playground
         * Only load in development to save memory in production
         */
        if (!isProduction) {
            import("@colyseus/playground").then(({ playground }) => {
                app.use("/", playground());
                console.log("Playground enabled (development mode)");
            });
        } else {
            app.get("/", (req, res) => {
                res.json({
                    status: "ok",
                    server: "Colyseus Game Server",
                    uptime: process.uptime(),
                    rooms: ["my_room", "emoji_warz"]
                });
            });
        }

        /**
         * Use @colyseus/monitor
         * It is recommended to protect this route with a password
         * Read more: https://docs.colyseus.io/tools/monitor/#restrict-access-to-the-panel-using-a-password
         */
        app.use("/monitor", monitor());
    },


    beforeListen: () => {
        /**
         * Before before gameServer.listen() is called.
         */
    }
});
