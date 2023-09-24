import express, { Express } from "express";
import http from "http";
import ChatServer from "../src/chatServer";
import * as dotenv from "dotenv";
import log4js from "log4js";

dotenv.config({ path: `test/.${process.env.NODE_ENV}.env` });

log4js.configure({
    appenders: { 'out': { type: 'console' } },
    categories: {
        default: { appenders: ['out'], level: 'info' },
        TamedChat: { appenders: ['out'], level: 'debug' },
    }
});
const logger = log4js.getLogger("TamedChatTest");

const app: Express = express();
app.use(express.static('test/public'));
const server = http.createServer(app).listen({ port: process.env.TAMED_CHAT_HTTP_PORT, host: '0.0.0.0' },
    () => { console.log("Server running at http://localhost:" + process.env.TAMED_CHAT_HTTP_PORT) });


const tmpMessageMap = {};
let hashCode = function (s) {
    var h = 0, l = s.length, i = 0;
    if (l > 0)
        while (i < l)
            h = (h << 5) - h + s.charCodeAt(i++) | 0;
    return h;
};

ChatServer.start(server);
ChatServer.registerAuthProvider((socket, payload) => {
    return Promise.resolve({ id: payload.data.userId })
});
ChatServer.registerPrivacyProvider((socket, payload) => {
    const hash = hashCode(socket.userId) | hashCode(payload.data.to);
    tmpMessageMap[hash] = (tmpMessageMap[hash] || [])
    tmpMessageMap[hash].push({ ...payload.data, ts: Date.now() });
    return Promise.resolve(true);
});
ChatServer.registerPastMessagesProvider((socket, payload) => {
    const hash = hashCode(socket.userId) | hashCode(payload.data.to);
    return Promise.resolve(tmpMessageMap[hash]);
});

