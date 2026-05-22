import { describe, it, expect } from 'vitest';
import { matchForkUuid } from './forkTarget';

describe('matchForkUuid', () => {
    const candidates = [
        { uuid: 'uuid-1', content: 'first prompt', timestamp: new Date(1000).toISOString() },
        { uuid: 'uuid-2', content: 'second prompt', timestamp: new Date(3000).toISOString() },
    ];

    it('matches a unique content', () => {
        expect(matchForkUuid({ text: 'second prompt', createdAt: 3000 }, candidates)).toBe('uuid-2');
    });

    it('returns null when no content matches', () => {
        expect(matchForkUuid({ text: 'nope', createdAt: 0 }, candidates)).toBeNull();
    });

    it('disambiguates duplicate content by nearest timestamp', () => {
        const dup = [
            { uuid: 'early', content: 'hi', timestamp: new Date(1000).toISOString() },
            { uuid: 'late', content: 'hi', timestamp: new Date(9000).toISOString() },
        ];
        expect(matchForkUuid({ text: 'hi', createdAt: 8500 }, dup)).toBe('late');
    });

    it('returns null for empty text (empty content never identifies a fork point)', () => {
        expect(matchForkUuid({ text: '', createdAt: 0 }, candidates)).toBeNull();
    });
});
