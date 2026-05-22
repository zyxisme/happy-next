export interface ForkCandidate {
    uuid: string;
    content: string;
    timestamp?: string;
}

/**
 * Match a target user message to a CLI-side UUID by exact text content.
 * Duplicates are disambiguated by the candidate whose timestamp is closest to
 * the target's createdAt. Returns null when no content matches.
 *
 * Assumption: when duplicate contents exist, at least one candidate is expected
 * to carry a valid timestamp; if none do, the first match is returned as a
 * best-effort fallback.
 */
export function matchForkUuid(
    target: { text: string; createdAt: number },
    candidates: ForkCandidate[],
): string | null {
    // Empty content can never meaningfully identify a fork point — bail early.
    if (!target.text) return null;
    const matches = candidates.filter((c) => c.content === target.text);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0].uuid;

    let best = matches[0];
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const candidate of matches) {
        const ts = candidate.timestamp ? Date.parse(candidate.timestamp) : NaN;
        const delta = Number.isNaN(ts) ? Number.POSITIVE_INFINITY : Math.abs(ts - target.createdAt);
        if (delta < bestDelta) {
            bestDelta = delta;
            best = candidate;
        }
    }
    return best.uuid;
}
