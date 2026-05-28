// packages/happy-app/sources/realtime/voiceModalRegistry.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { ModalRegistry } from './voiceModalRegistry';

describe('ModalRegistry', () => {
    afterEach(() => {
        // reset singleton state across tests
        while (ModalRegistry.dismissCurrent()) { /* drain */ }
    });

    it('hasCurrent reflects register/unregister', () => {
        const m = { dismiss: () => {} };
        expect(ModalRegistry.hasCurrent()).toBe(false);
        ModalRegistry.register(m);
        expect(ModalRegistry.hasCurrent()).toBe(true);
        ModalRegistry.unregister(m);
        expect(ModalRegistry.hasCurrent()).toBe(false);
    });

    it('register replacement dismisses previous', () => {
        let dismissed1 = false;
        const m1 = { dismiss: () => { dismissed1 = true; } };
        const m2 = { dismiss: () => {} };
        ModalRegistry.register(m1);
        ModalRegistry.register(m2);
        expect(dismissed1).toBe(true);
        expect(ModalRegistry.hasCurrent()).toBe(true);
    });

    it('register same handle twice does not self-dismiss', () => {
        let count = 0;
        const m = { dismiss: () => { count++; } };
        ModalRegistry.register(m);
        ModalRegistry.register(m);
        expect(count).toBe(0);
    });

    it('dismissCurrent calls dismiss, clears state, returns true', () => {
        let dismissed = false;
        const m = { dismiss: () => { dismissed = true; } };
        ModalRegistry.register(m);
        const result = ModalRegistry.dismissCurrent();
        expect(result).toBe(true);
        expect(dismissed).toBe(true);
        expect(ModalRegistry.hasCurrent()).toBe(false);
    });

    it('dismissCurrent returns false when nothing registered', () => {
        expect(ModalRegistry.dismissCurrent()).toBe(false);
    });

    it('unregister of non-current is no-op', () => {
        const m1 = { dismiss: () => {} };
        const m2 = { dismiss: () => {} };
        ModalRegistry.register(m1);
        ModalRegistry.unregister(m2);
        expect(ModalRegistry.hasCurrent()).toBe(true);
    });
});
