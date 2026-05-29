// packages/happy-app/sources/realtime/voiceModalRegistry.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { ModalRegistry } from './voiceModalRegistry';

describe('ModalRegistry', () => {
    afterEach(() => {
        // reset singleton state across tests
        while (ModalRegistry.dismissCurrent()) { /* drain */ }
    });

    it('hasCurrent reflects register/unregister', () => {
        const m = { kind: 'picker' as const, dismiss: () => {} };
        expect(ModalRegistry.hasCurrent()).toBe(false);
        ModalRegistry.register(m);
        expect(ModalRegistry.hasCurrent()).toBe(true);
        ModalRegistry.unregister(m);
        expect(ModalRegistry.hasCurrent()).toBe(false);
    });

    it('register replacement dismisses previous', () => {
        let dismissed1 = false;
        const m1 = { kind: 'picker' as const, dismiss: () => { dismissed1 = true; } };
        const m2 = { kind: 'picker' as const, dismiss: () => {} };
        ModalRegistry.register(m1);
        ModalRegistry.register(m2);
        expect(dismissed1).toBe(true);
        expect(ModalRegistry.hasCurrent()).toBe(true);
    });

    it('register same handle twice does not self-dismiss', () => {
        let count = 0;
        const m = { kind: 'picker' as const, dismiss: () => { count++; } };
        ModalRegistry.register(m);
        ModalRegistry.register(m);
        expect(count).toBe(0);
    });

    it('dismissCurrent calls dismiss, clears state, returns true', () => {
        let dismissed = false;
        const m = { kind: 'picker' as const, dismiss: () => { dismissed = true; } };
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
        const m1 = { kind: 'picker' as const, dismiss: () => {} };
        const m2 = { kind: 'picker' as const, dismiss: () => {} };
        ModalRegistry.register(m1);
        ModalRegistry.unregister(m2);
        expect(ModalRegistry.hasCurrent()).toBe(true);
    });

    it('dismissCurrentPicker dismisses pickers only, leaves countdowns alone', () => {
        let pickerDismissed = false;
        let countdownDismissed = false;
        const picker = { kind: 'picker' as const, dismiss: () => { pickerDismissed = true; } };
        const countdown = { kind: 'countdown' as const, dismiss: () => { countdownDismissed = true; } };

        ModalRegistry.register(countdown);
        expect(ModalRegistry.dismissCurrentPicker()).toBe(false);
        expect(countdownDismissed).toBe(false);
        expect(ModalRegistry.hasCurrent()).toBe(true);

        ModalRegistry.unregister(countdown);
        ModalRegistry.register(picker);
        expect(ModalRegistry.dismissCurrentPicker()).toBe(true);
        expect(pickerDismissed).toBe(true);
        expect(ModalRegistry.hasCurrent()).toBe(false);
    });
});
