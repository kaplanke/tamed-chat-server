import log4js from "@log4js-node/log4js-api";
import express, { json, Application } from "express";
import fs from "fs";
import http from "http";
import https from "https";
import { Server } from "socket.io";

const logger = log4js.getLogger("TamedChat");

const DEFAULT_PORT = 5000;
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_SERVER_ERROR = 500;

export class TamedChatServer {
    public webServer: http.Server | https.Server;
    private app: Application;
    private chatServer?: Server;
    private userSockets;
    private providers;

    constructor(webServer?: http.Server | https.Server, app?: Application) {

        this.userSockets = {};
        this.providers = {};

        !app ? this.app = express() : this.app = app;

        if (webServer) {
            this.webServer = webServer;
            this._init();
        } else {
            if (process.env.TAMED_CHAT_HTTPS_PORT) {
                this.webServer = https.createServer({
                    key: fs.readFileSync(process.env.TAMED_CHAT_TLS_KEYPATH as string),
                    cert: fs.readFileSync(process.env.TAMED_CHAT_TLS_CERTPATH as string)
                }, this.app).listen({ port: process.env.TAMED_CHAT_HTTPS_PORT, host: '0.0.0.0' },
                    () => {
                        logger.debug("Secure Server running at https://localhost:" + process.env.TAMED_CHAT_HTTPS_PORT);
                        this._init();
                    });
            } else {
                this.webServer = http.createServer(this.app).listen({ port: (process.env.TAMED_CHAT_HTTP_PORT || DEFAULT_PORT), host: '0.0.0.0' },
                    () => {
                        logger.debug("Server running at http://localhost:" + (process.env.TAMED_CHAT_HTTP_PORT || DEFAULT_PORT));
                        this._init();
                    });
            }
        }
    }

    _init = () => {

        this.app.use(json());

        this.app.get("/", (req, res) => {
            res.send('Tamed Chat Express Web Server');
        });

        this.app.post("/getIceServers", (req, res) => {
            this.providers["auth"](req.body).then(user => {
                this.providers["ice"]().then((servers) => {
                    res.status(HTTP_OK).send(servers);
                }).catch((err) => {
                    res.status(HTTP_SERVER_ERROR).send(err);
                });
            }).catch((err) => {
                res.status(HTTP_UNAUTHORIZED).send({ msg: "Unauthorized!" });
            });
        });

        this.chatServer = new Server(this.webServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
            transports: ['websocket', 'polling'],
            allowEIO3: true
        });

        this.chatServer.on('connection', (socket: any) => {

            socket.on('disconnect', () => {
                logger.info(`${socket.userId} user disconnecting`);
                socket.disconnect();
            });
            socket.on("message", (payload: any) => {
                try {
                    if (!socket.userId && payload.action !== "authorize") {
                        socket.emit("error", { msg: "Authorization required" });
                    } else {
                        this["__" + payload.action](socket, payload);
                    }
                } catch (err) {
                    logger.error("Message error", err);
                }
            });
        });

    }

    __authorize = (socket: any, payload: any) => {
        logger.debug("Tamed Chat login req", payload);
        if (!this.providers["auth"]) {
            socket.emit("error", "Auth provider not found!");
        } else {
            this.providers["auth"](payload).then(user => {
                socket.userId = user.id;
                logger.info(socket.userId + " just connected!");
                if (!this.userSockets[socket.userId]) {
                    this.userSockets[socket.userId] = {};
                }
                this.userSockets[socket.userId][payload.channel] = socket;
                socket.send(user);
            }).catch((err) => {
                socket.emit("error", err.message ? { msg: err.message } : err);
            });
        }
    }

    __getPastMessages = (socket: any, payload: any) => {
        logger.debug("Get past chat messages", payload);
        if (!this.providers["pastMessages"]) {
            socket.send({ messages: [] });
        } else {
            this.providers["pastMessages"](socket, payload).then(pastMessages => {
                socket.send({ messages: pastMessages });
            }).catch(err => {
                socket.emit("error", err.message ? { msg: err.message } : err);
            });
        }
    }

    __newMessage = (socket: any, payload: any) => {
        logger.debug("New chat messages", payload);
        if (!this.providers["privacy"]) {
            socket.emit("error", "Privacy provider not found!");
        } else {
            this.providers["privacy"](socket, payload).then(res => {
                if (res.Msg === "allowed") {
                    this._cleanAndSend(socket.userId, payload.data.to, payload.data.msg);
                } else {
                    socket.emit("error", "Privacy check failed!");
                }
            }).catch(err => {
                socket.emit("error", err.message ? { msg: err.message } : err);
            });
        }
    }

    __makeAVCall = (socket: any, payload: any) => {
        logger.debug("New AV call", payload);
        if (!this.providers["privacy"]) {
            socket.emit("error", "Privacy provider not found!");
        } else {
            this.providers["privacy"](socket, payload).then(res => {
                if (res.VC === "allowed") {
                    this._cleanAndSend(socket.userId, payload.data.to, {
                        action: "AVCallMade",
                        offer: payload.data.offer,
                        callId: payload.data.privacy.callId
                    });
                } else {
                    socket.emit("error", "Privacy check failed!");
                }
            }).catch(err => {
                socket.emit("error", err.message ? { msg: err.message } : err);
            });
        }
    }

    __makeAVAnswer = (socket: any, payload: any) => {
        logger.debug("AV Answer ", payload);
        if (!this.providers["privacy"]) {
            socket.emit("error", "Privacy provider not found!");
        } else {
            if (payload.data.answer) {
                this.providers["privacy"](socket, payload).then(res => {
                    if (res.VC === "allowed") {
                        this._cleanAndSend(socket.userId, payload.data.to, {
                            action: "AVAnswerMade",
                            answer: payload.data.answer,
                            callId:payload.data.privacy.callId
                        });
                    } else {
                        socket.emit("error", "Privacy check failed!");
                    }
                }).catch(err => {
                    socket.emit("error", err.message ? { msg: err.message } : err);
                });
            } else {
                this._cleanAndSend(socket.userId, payload.data.to, {
                    action: "AVAnswerMade",
                    answer: payload.data.answer,
                    ic: payload.data.ic,
                    socket: socket.id
                });
            }
        }
    }

    __hangupAVCall = (socket: any, payload: any) => {
        logger.debug("AV Answer ", payload);
        if (!this.providers["privacy"]) {
            socket.emit("error", "Privacy provider not found!");
        } else {
            this.providers["privacy"](socket, payload).then(res => {
                if (res.VC === "allowed") {
                    this._cleanAndSend(socket.userId, payload.data.to, {
                        action: "AVCallClosed",
                        socket: socket.id
                    });
                } else {
                    socket.emit("error", "Privacy check failed!");
                }
            }).catch(err => {
                socket.emit("error", err.message ? { msg: err.message } : err);
            });
        }
    }

    _cleanAndSend = (from: any, to: any, msg: any) => {
        const userSockets = this.userSockets[to];
        if (userSockets) {
            for (var channel in userSockets) {
                if (userSockets.hasOwnProperty(channel)) {
                    if (userSockets[channel] && userSockets[channel].connected) {
                        userSockets[channel].send({
                            from, msg
                        });
                    } else {
                        delete userSockets[channel];
                    }
                }
            }
        } else {
            //TODO: unreachable user callback...
        }
    }

    registerAuthProvider = (authProvider: (payload: any) => Promise<any>) => {
        this.providers["auth"] = authProvider;
    }

    registerPastMessagesProvider = (pastMessagesProvider: (socket: any, payload: any) => Promise<any[]>) => {
        this.providers["pastMessages"] = pastMessagesProvider;
    }

    registerPrivacyProvider = (privacyProvider: (socket: any, payload: any) => Promise<any>) => {
        this.providers["privacy"] = privacyProvider;
    }

    registerIceProvider = (iceProvider: () => Promise<[]>) => {
        this.providers["ice"] = iceProvider;
    }

}
