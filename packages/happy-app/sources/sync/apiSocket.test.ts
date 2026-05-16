import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Build a fake socket.io client object before the mock factory runs.
let fakeSocket: any;

vi.mock('socket.io-client', () => ({
    io: () => fakeSocket,
}));

// `apiSocket.ts` only uses `Encryption` as a TypeScript type annotation,
// but the import is still executed at runtime. Stub it so the real
// encryption module (and its transitive deps) does not need to load.
vi.mock('./encryption/encryption', () => ({}));

// `TokenStorage` is imported at module load. Stub to avoid pulling in
// real auth/storage modules.
vi.mock('@/auth/tokenStorage', () => ({
    TokenStorage: {},
}));

import { ApiSocket } from './apiSocket';

function makeFakeSocket() {
    const emitter = new EventEmitter();
    const fake: any = emitter;
    fake.recovered = false;
    fake.disconnect = vi.fn();
    fake.onAny = vi.fn();
    return fake;
}

describe('ApiSocket reconnected detection', () => {
    beforeEach(() => {
        fakeSocket = makeFakeSocket();
    });

    it('first connect does NOT fire reconnectedListeners but does fire statusListeners with "connected"', () => {
        const sock = new ApiSocket();
        const onReconnected = vi.fn();
        const statusCalls: string[] = [];
        sock.onReconnected(onReconnected);
        sock.onStatusChange((s) => statusCalls.push(s));

        sock.initialize({ endpoint: 'https://x', token: 't' }, {} as any);

        // Simulate the socket.io 'connect' event for the first time.
        fakeSocket.recovered = false;
        fakeSocket.emit('connect');

        expect(onReconnected).not.toHaveBeenCalled();
        expect(statusCalls).toContain('connected');
    });

    it('second connect (after disconnect) with !recovered fires reconnectedListeners', () => {
        const sock = new ApiSocket();
        const onReconnected = vi.fn();
        sock.onReconnected(onReconnected);

        sock.initialize({ endpoint: 'https://x', token: 't' }, {} as any);

        fakeSocket.recovered = false;
        fakeSocket.emit('connect'); // first — must not fire
        expect(onReconnected).not.toHaveBeenCalled();

        fakeSocket.emit('disconnect', 'transport close');
        fakeSocket.recovered = false;
        fakeSocket.emit('connect'); // real reconnect — must fire

        expect(onReconnected).toHaveBeenCalledTimes(1);
    });

    it('reconnect with recovered=true does NOT fire reconnectedListeners', () => {
        const sock = new ApiSocket();
        const onReconnected = vi.fn();
        sock.onReconnected(onReconnected);

        sock.initialize({ endpoint: 'https://x', token: 't' }, {} as any);
        fakeSocket.emit('connect'); // first

        fakeSocket.emit('disconnect', 'transport close');
        fakeSocket.recovered = true;
        fakeSocket.emit('connect'); // recovered reconnect — silent

        expect(onReconnected).not.toHaveBeenCalled();
    });
});
