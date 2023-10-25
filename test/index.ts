import * as dotenv from "dotenv";
import log4js from "log4js";
import { TamedChatServer } from "../src";

dotenv.config({ path: `test/.${process.env.NODE_ENV}.env` });

log4js.configure({
    appenders: { 'out': { type: 'console' } },
    categories: {
        default: { appenders: ['out'], level: 'info' },
        TamedChat: { appenders: ['out'], level: 'debug' },
    }
});
const logger = log4js.getLogger("TamedChatTest");

const tmpMessageMap = {};
let hashCode = function (s) {
    var h = 0, l = s.length, i = 0;
    if (l > 0)
        while (i < l)
            h = (h << 5) - h + s.charCodeAt(i++) | 0;
    return h;
};

const chatServer = new TamedChatServer() 
chatServer.registerAuthProvider((socket, payload) => {
    return Promise.resolve({ id: payload.data.userId })
});
chatServer.registerPrivacyProvider((socket, payload) => {
    const hash = hashCode(socket.userId) | hashCode(payload.data.to);
    tmpMessageMap[hash] = (tmpMessageMap[hash] || [])
    tmpMessageMap[hash].push({ ...payload.data, ts: Date.now() });
    return Promise.resolve(true);
});
chatServer.registerPastMessagesProvider((socket, payload) => {
    const hash = hashCode(socket.userId) | hashCode(payload.data.to);
    return Promise.resolve(tmpMessageMap[hash]);
});

