import { describe, expect, it } from 'vitest';
import { SessionsBootstrapMachine } from './sessionsBootstrapMachine';

describe('SessionsBootstrapMachine', () => {
    it('starts in idle and planNext returns "bootstrap"', () => {
        const m = new SessionsBootstrapMachine();
        expect(m.getState()).toBe('idle');
        expect(m.planNext()).toBe('bootstrap');
    });

    it('beginBootstrap moves idle to bootstrapping', () => {
        const m = new SessionsBootstrapMachine();
        m.beginBootstrap();
        expect(m.getState()).toBe('bootstrapping');
    });

    it('planNext during bootstrapping returns "skip" and arms pending', () => {
        const m = new SessionsBootstrapMachine();
        m.beginBootstrap();
        expect(m.planNext()).toBe('skip');
        expect(m.hasPendingIncremental()).toBe(true);
        // Repeated calls stay "skip" and pending stays armed (idempotent).
        expect(m.planNext()).toBe('skip');
        expect(m.hasPendingIncremental()).toBe(true);
    });

    it('completeBootstrap returns "incremental" when pending armed and clears pending', () => {
        const m = new SessionsBootstrapMachine();
        m.beginBootstrap();
        m.planNext(); // arms pending
        expect(m.completeBootstrap()).toBe('incremental');
        expect(m.getState()).toBe('ready');
        expect(m.hasPendingIncremental()).toBe(false);
    });

    it('completeBootstrap returns "done" when no pending', () => {
        const m = new SessionsBootstrapMachine();
        m.beginBootstrap();
        expect(m.completeBootstrap()).toBe('done');
        expect(m.getState()).toBe('ready');
    });

    it('planNext in ready returns "incremental"', () => {
        const m = new SessionsBootstrapMachine();
        m.beginBootstrap();
        m.completeBootstrap();
        expect(m.planNext()).toBe('incremental');
        expect(m.getState()).toBe('ready');
    });

    it('failBootstrap returns bootstrapping to idle and keeps pending for the next attempt', () => {
        const m = new SessionsBootstrapMachine();
        m.beginBootstrap();
        m.planNext(); // arm pending
        m.failBootstrap();
        expect(m.getState()).toBe('idle');
        expect(m.hasPendingIncremental()).toBe(true);
    });

    it('reset clears state and pending', () => {
        const m = new SessionsBootstrapMachine();
        m.beginBootstrap();
        m.planNext();
        m.completeBootstrap();
        m.reset();
        expect(m.getState()).toBe('idle');
        expect(m.hasPendingIncremental()).toBe(false);
    });

    it('beginBootstrap is a no-op when not idle (defensive)', () => {
        const m = new SessionsBootstrapMachine();
        m.beginBootstrap();
        m.beginBootstrap(); // second call — should not crash; state stays bootstrapping
        expect(m.getState()).toBe('bootstrapping');
    });
});
