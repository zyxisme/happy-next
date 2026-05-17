/**
 * Tracks whether the sessions list has finished its initial "bootstrap"
 * (cursor=0 page + backfill) for the current account. Used by Sync to
 * route InvalidateSync runs into either bootstrap, incremental, or skip
 * (when a bootstrap is already in flight, the next incremental is queued).
 *
 * Pure — no I/O, no side effects on storage. Owned and called by Sync.
 */
export type SessionsInitState = 'idle' | 'bootstrapping' | 'ready';

export type SessionsSyncPlan = 'bootstrap' | 'incremental' | 'skip';

export class SessionsBootstrapMachine {
    private state: SessionsInitState = 'idle';
    private pendingIncrementalAfterBootstrap = false;

    getState(): SessionsInitState {
        return this.state;
    }

    hasPendingIncremental(): boolean {
        return this.pendingIncrementalAfterBootstrap;
    }

    /**
     * Decide what the caller should run for this sync request.
     * If we're already bootstrapping, arm a follow-up incremental and skip.
     */
    planNext(): SessionsSyncPlan {
        switch (this.state) {
            case 'idle':
                return 'bootstrap';
            case 'bootstrapping':
                this.pendingIncrementalAfterBootstrap = true;
                return 'skip';
            case 'ready':
                return 'incremental';
        }
    }

    beginBootstrap(): void {
        if (this.state !== 'idle') return;
        this.state = 'bootstrapping';
    }

    /**
     * Bootstrap finished successfully. Move to ready. Returns 'incremental'
     * if a follow-up incremental was queued during the bootstrap (caller
     * should run it immediately).
     */
    completeBootstrap(): 'incremental' | 'done' {
        this.state = 'ready';
        if (this.pendingIncrementalAfterBootstrap) {
            this.pendingIncrementalAfterBootstrap = false;
            return 'incremental';
        }
        return 'done';
    }

    /**
     * Bootstrap failed. Return to idle so the next invalidate retries the
     * full bootstrap. Pending flag is preserved so callers know an
     * incremental was queued (although the retry bootstrap supersedes it).
     */
    failBootstrap(): void {
        this.state = 'idle';
    }

    /**
     * Hydrated from a durable local cache. Treat the list as bootstrapped so
     * the next network sync can use the saved updatedAt cursor.
     */
    markReady(): void {
        this.state = 'ready';
        this.pendingIncrementalAfterBootstrap = false;
    }

    /**
     * Account switch, logout, or restore — clear everything.
     */
    reset(): void {
        this.state = 'idle';
        this.pendingIncrementalAfterBootstrap = false;
    }
}
