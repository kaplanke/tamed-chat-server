import log4js from "@log4js-node/log4js-api";
import express, { Application } from "express";
import fs from "fs";
import http from "http";
import https from "https";
import ChatServer from "./chatServer";

const logger = log4js.getLogger("TamedChat");

export class TamedChatServer {
    private webServer?: http.Server | https.Server;
    private readonly DEFAULT_PORT = 5000;

    
    constructor(webServer?: http.Server | https.Server) {
        try {

            this.webServer = webServer;
            if (!this.webServer) {
                const app: Application = express();
                if (process.env.TAMED_CHAT_HTTPS_PORT) {
                    this.webServer = https.createServer({
                        key: fs.readFileSync(process.env.TAMED_CHAT_TLS_KEYPATH as string),
                        cert: fs.readFileSync(process.env.TAMED_CHAT_TLS_CERTPATH as string)
                    }, app).listen({ port: process.env.TAMED_CHAT_HTTPS_PORT, host: '0.0.0.0' },
                        () => { console.log("Secure Server running at https://localhost:" + process.env.TAMED_CHAT_HTTPS_PORT) });
                    // init secure chat server
                    ChatServer.start(this.webServer);
                } else if (process.env.TAMED_CHAT_HTTP_PORT) {
                    this.webServer = http.createServer(app).listen({ port: process.env.TAMED_CHAT_HTTP_PORT || this.DEFAULT_PORT, host: '0.0.0.0' },
                        () => { console.log("Server running at http://localhost:" + process.env.TAMED_CHAT_HTTP_PORT || this.DEFAULT_PORT) });
                    // init chat server
                    ChatServer.start(this.webServer);
                }
                app.get("/", (req, res) => {
                    res.send('Tamed Chat Express Web Server');
                });
            } else {
                ChatServer.start(this.webServer);
            }
        } catch (err) {
            logger.error("Error during starting Tamed Chat!", err);
        }
    }
    
    registerAuthProvider = (authProvider: (socket: any, payload: any) => Promise<any>) => {
        ChatServer.registerAuthProvider(authProvider);
    }

    registerPastMessagesProvider =  (pastMessagesProvider: (socket: any, payload: any) => Promise<any[]>) => {
        ChatServer.registerPastMessagesProvider(pastMessagesProvider);
    }

    registerPrivacyProvider =  (privacyProvider: (socket: any, payload: any) => Promise<boolean>) => {
        ChatServer.registerPrivacyProvider(privacyProvider);
    }
}
