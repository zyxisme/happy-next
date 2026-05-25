import crypto from 'node:crypto';

/**
 * Volcano Engine RTC AccessToken generator.
 * Ported from the official Node sample (volcengine/rtc-aigc-demo Server/token.js).
 * Token format: VERSION(001) + appID(24) + base64(packMsg + signature).
 */

const VERSION = '001';

export const Privileges = {
    PrivPublishStream: 0,
    privPublishAudioStream: 1,
    privPublishVideoStream: 2,
    privPublishDataStream: 3,
    PrivSubscribeStream: 4,
} as const;

class ByteBuf {
    private buffer = Buffer.alloc(1024);
    private position = 0;

    pack(): Buffer {
        const out = Buffer.alloc(this.position);
        this.buffer.copy(out, 0, 0, out.length);
        return out;
    }

    putUint16(v: number): this {
        this.buffer.writeUInt16LE(v, this.position);
        this.position += 2;
        return this;
    }

    putUint32(v: number): this {
        this.buffer.writeUInt32LE(v, this.position);
        this.position += 4;
        return this;
    }

    putBytes(bytes: Buffer): this {
        this.putUint16(bytes.length);
        bytes.copy(this.buffer, this.position);
        this.position += bytes.length;
        return this;
    }

    putString(str: string): this {
        return this.putBytes(Buffer.from(str));
    }

    putTreeMapUInt32(map: Record<number, number>): this {
        if (!map) {
            this.putUint16(0);
            return this;
        }
        const keys = Object.keys(map);
        this.putUint16(keys.length);
        for (const key of keys) {
            this.putUint16(Number(key));
            this.putUint32(map[Number(key)]);
        }
        return this;
    }
}

function encodeHMac(key: string, message: Buffer): Buffer {
    return crypto.createHmac('sha256', key).update(message).digest();
}

export class AccessToken {
    private issuedAt = Math.floor(Date.now() / 1000);
    private nonce = Math.floor(Math.random() * 0xffffffff);
    private expireAt = 0;
    private privileges: Record<number, number> = {};

    constructor(
        private appID: string,
        private appKey: string,
        private roomID: string,
        private userID: string,
    ) {}

    addPrivilege(privilege: number, expireTimestamp: number): void {
        this.privileges[privilege] = expireTimestamp;
        if (privilege === Privileges.PrivPublishStream) {
            this.privileges[Privileges.privPublishVideoStream] = expireTimestamp;
            this.privileges[Privileges.privPublishAudioStream] = expireTimestamp;
            this.privileges[Privileges.privPublishDataStream] = expireTimestamp;
        }
    }

    expireTime(expireTimestamp: number): void {
        this.expireAt = expireTimestamp;
    }

    private packMsg(): Buffer {
        const bufM = new ByteBuf();
        bufM.putUint32(this.nonce);
        bufM.putUint32(this.issuedAt);
        bufM.putUint32(this.expireAt);
        bufM.putString(this.roomID);
        bufM.putString(this.userID);
        bufM.putTreeMapUInt32(this.privileges);
        return bufM.pack();
    }

    serialize(): string {
        const bytesM = this.packMsg();
        const signature = encodeHMac(this.appKey, bytesM);
        const content = new ByteBuf().putBytes(bytesM).putBytes(signature).pack();
        return VERSION + this.appID + content.toString('base64');
    }
}

/**
 * Build a join token for a human participant: publish + subscribe, expiring in ttlSeconds.
 */
export function buildRtcToken(params: {
    appId: string;
    appKey: string;
    roomId: string;
    userId: string;
    ttlSeconds: number;
}): string {
    const token = new AccessToken(params.appId, params.appKey, params.roomId, params.userId);
    const expireAt = Math.floor(Date.now() / 1000) + params.ttlSeconds;
    token.addPrivilege(Privileges.PrivPublishStream, expireAt);
    token.addPrivilege(Privileges.PrivSubscribeStream, expireAt);
    token.expireTime(expireAt);
    return token.serialize();
}
