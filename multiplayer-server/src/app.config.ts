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

        /**
         * Bind your custom express routes here:
         * Read more: https://expressjs.com/en/starter/basic-routing.html
         */
        app.get("/hello_world", (req, res) => {
            res.send("It's time to kick ass and chew bubblegum!");
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
