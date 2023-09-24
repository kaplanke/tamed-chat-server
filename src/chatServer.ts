import { Server } from "socket.io";
import log4js from "@log4js-node/log4js-api";

let chatServer: Server | undefined = undefined;
const logger = log4js.getLogger("TamedChat");

const ChatServer = {

    userSockets: {},
    providers: {},

    start: function (httpOrHttps) {
        try {
            if (chatServer) throw new Error("Chat server already initialized!");

            chatServer = new Server(httpOrHttps, {
                cors: {
                    origin: "*",
                    methods: ["GET", "POST"]
                },
                transports: ['websocket', 'polling'],
                allowEIO3: true
            });

            chatServer.on('connection', (socket: any) => {

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
        } catch (err) {
            logger.error("Cannot start chat server!", err);
        }
    },

    __authorize: function (socket: any, payload: any) {
        logger.debug("Tamed Chat login req", payload);
        if (!this.providers["auth"]) {
            socket.emit("error", "Auth provider not found!");
        } else {
            this.providers["auth"](socket, payload).then(user => {
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
    },

    __getPastMessages: function (socket: any, payload: any) {
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
    },

    __newMessage: function (socket: any, payload: any) {
        logger.debug("New chat messages", payload);
        if (!this.providers["privacy"]) {
            socket.emit("error", "Privacy provider not found!");
        } else {
            this.providers["privacy"](socket, payload).then(res => {
                if (res) {
                    this._cleanAndSend(socket.userId, payload.data.to, payload.data.msg);
                } else {
                    socket.emit("error", "Privacy check failed!");
                }
            }).catch(err => {
                socket.emit("error", err.message ? { msg: err.message } : err);
            });
        }
    },

    __makeAVCall: function (socket: any, payload: any) {
        logger.debug("New AV call", payload);
        if (!this.providers["privacy"]) {
            socket.emit("error", "Privacy provider not found!");
        } else {
            this.providers["privacy"](socket, payload).then(res => {
                this._cleanAndSend(socket.userId, payload.data.to, {
                    action: "AVCallMade",
                    offer: payload.data.offer,
                    socket: socket.id
                });
            }).catch(err => {
                socket.emit("error", err.message ? { msg: err.message } : err);
            });
        }
    },

    __makeAVAnswer: function (socket: any, payload: any) {
        logger.debug("AV Answer ", payload);
        if (!this.providers["privacy"]) {
            socket.emit("error", "Privacy provider not found!");
        } else {
            this.providers["privacy"](socket, payload).then(res => {

                this._cleanAndSend(socket.userId, payload.data.to, {
                    action: "AVAnswerMade",
                    answer: payload.data.answer,
                    socket: socket.id
                });
            }).catch(err => {
                socket.emit("error", err.message ? { msg: err.message } : err);
            });
        }
    },

    __hangupAVCall: function (socket: any, payload: any) {
        logger.debug("AV Answer ", payload);
        if (!this.providers["privacy"]) {
            socket.emit("error", "Privacy provider not found!");
        } else {
            this.providers["privacy"](socket, payload).then(res => {
                this._cleanAndSend(socket.userId, payload.data.to, {
                    action: "AVCallClosed",
                    socket: socket.id
                });
            }).catch(err => {
                socket.emit("error", err.message ? { msg: err.message } : err);
            });
        }
    },


    _cleanAndSend: function (from: any, to: any, msg: any) {
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
    },

    registerAuthProvider: function (authProvider: (socket: any, payload: any) => Promise<any>) {
        this.providers["auth"] = authProvider;
    },

    registerPastMessagesProvider: function (pastMessagesProvider: (socket: any, payload: any) => Promise<any[]>) {
        this.providers["pastMessages"] = pastMessagesProvider;
    },

    registerPrivacyProvider: function (privacyProvider: (socket: any, payload: any) => Promise<boolean>) {
        this.providers["privacy"] = privacyProvider;
    }

}

export default ChatServer;

