import * as AWS_KVS from '@aws-sdk/client-kinesis-video';
import * as AWS_KVS_SIG from '@aws-sdk/client-kinesis-video-signaling';
import * as dotenv from "dotenv";
import log4js from "log4js";
import { TamedChatServer } from "../src";

dotenv.config({ path: `.${process.env.NODE_ENV}.env` });

log4js.configure({
    appenders: { 'out': { type: 'console' } },
    categories: {
        default: { appenders: ['out'], level: 'debug' },
        TamedChatTest: { appenders: ['out'], level: 'debug' },
        TamedChat: { appenders: ['out'], level: 'debug' }
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

const chatServer = new TamedChatServer();

chatServer.registerAuthProvider((payload) => {
    return Promise.resolve({ id: payload.data.userId })
});
chatServer.registerPrivacyProvider((socket, payload) => {
    const hash = hashCode(socket.userId) | hashCode(payload.data.to);
    tmpMessageMap[hash] = (tmpMessageMap[hash] || [])
    tmpMessageMap[hash].push({ ...payload.data, ts: Date.now() });
    return Promise.resolve({ Msg: "allowed", VC: "allowed" });
});
chatServer.registerPastMessagesProvider((socket, payload) => {
    const hash = hashCode(socket.userId) | hashCode(payload.data.to);
    return Promise.resolve(tmpMessageMap[hash]);
});

chatServer.registerIceProvider(() => {

    return new Promise(async (resolve, reject) => {
        try {

            const channelARN = process.env.AWS_KVS_CHANNEL_ARN as string;
            const accessKeyId = process.env.AWS_KVS_ACCESSKEY_ID as string;
            const secretAccessKey = process.env.AWS_KVS_SECRET_ACCESSKEY as string;
            const region = process.env.AWS_KVS_REGION as string;

            const kinesisVideoClient = new AWS_KVS.KinesisVideoClient({
                region,
                credentials: {
                    accessKeyId: accessKeyId,
                    secretAccessKey: secretAccessKey
                }
            });

            const getSignalingChannelEndpointCommand = new AWS_KVS.GetSignalingChannelEndpointCommand({
                ChannelARN: channelARN,
                SingleMasterChannelEndpointConfiguration: {
                    Protocols: [
                        AWS_KVS.ChannelProtocol.WSS, //may be ignored
                        AWS_KVS.ChannelProtocol.HTTPS
                    ],
                    Role: AWS_KVS.ChannelRole.VIEWER
                }
            });

            const signalingChannelEndpoint = await kinesisVideoClient.send(getSignalingChannelEndpointCommand);
            const kinesisVideoSignallingClient = new AWS_KVS_SIG.KinesisVideoSignaling({
                endpoint: signalingChannelEndpoint.ResourceEndpointList?.filter(x => x.Protocol === "HTTPS")[0].ResourceEndpoint,
                region,
                credentials: {
                    accessKeyId: accessKeyId,
                    secretAccessKey: secretAccessKey
                }
            });
            const getIceServerConfigCommandInput: AWS_KVS_SIG.GetIceServerConfigCommandInput = {
                ChannelARN: channelARN,
                Service: "TURN",
            };
            const getIceServerConfigResponse: AWS_KVS_SIG.GetIceServerConfigCommandOutput = await kinesisVideoSignallingClient.getIceServerConfig(getIceServerConfigCommandInput);
            const iceServers: any = [
                { urls: `stun:stun.kinesisvideo.${region}.amazonaws.com:443` }
            ];
            getIceServerConfigResponse.IceServerList?.forEach(iceServer =>
                iceServers.push({
                    urls: iceServer.Uris,
                    username: iceServer.Username,
                    credential: iceServer.Password,
                }),
            );
            resolve(iceServers);
        } catch (err) {
            reject(err);
        }
    });
});

// Register an endpoint to send a tamed push message to a user
chatServer.registerEndpoint('post', '/push', (req, res) => {
    const { toUserId, payload } = req.body;
    if (!toUserId || !payload) {
        return res.status(400).json({ error: "toUserId and payload are required" });
    }
    try {
        chatServer.sendPushMessage(toUserId, payload);
        res.json({ status: "Push message sent" });
    } catch (err: any) {
        res.status(500).json(err.message);
    }
});
