import { describe, it, expect } from 'vitest';
import { computeScrollIntoView } from './scrollIntoView';

// viewport = 240, itemHeight = 48 → 5 items visible (indices 0..4 at scrollY 0)
const VIEWPORT = 240;
const ITEM = 48;

describe('computeScrollIntoView', () => {
    it('returns null when the item is already fully visible at the top', () => {
        expect(computeScrollIntoView({ selectedIndex: 0, itemHeight: ITEM, currentScrollY: 0, viewportHeight: VIEWPORT })).toBeNull();
        expect(computeScrollIntoView({ selectedIndex: 4, itemHeight: ITEM, currentScrollY: 0, viewportHeight: VIEWPORT })).toBeNull();
    });

    it('scrolls down to align the item to the bottom when it is below the viewport', () => {
        // index 5 → bottom = 6*48 = 288, 288 - 240 = 48
        expect(computeScrollIntoView({ selectedIndex: 5, itemHeight: ITEM, currentScrollY: 0, viewportHeight: VIEWPORT })).toBe(48);
    });

    it('wraps to the last item: aligns it to the bottom from the top', () => {
        // 10 items, jump from index 0 to index 9 (wrap-around). bottom = 10*48 = 480, 480 - 240 = 240
        expect(computeScrollIntoView({ selectedIndex: 9, itemHeight: ITEM, currentScrollY: 0, viewportHeight: VIEWPORT })).toBe(240);
    });

    it('scrolls up to align the item to the top when it is above the viewport', () => {
        // currently scrolled to 240, select index 2 → itemTop = 96 < 240 → return 96
        expect(computeScrollIntoView({ selectedIndex: 2, itemHeight: ITEM, currentScrollY: 240, viewportHeight: VIEWPORT })).toBe(96);
    });

    it('returns null while moving within the currently visible window', () => {
        // scrolled to 48 (items 1..5 visible), select index 3 → top 144, bottom 192, within [48, 288]
        expect(computeScrollIntoView({ selectedIndex: 3, itemHeight: ITEM, currentScrollY: 48, viewportHeight: VIEWPORT })).toBeNull();
    });

    it('returns null for no selection (-1) or non-actionable dimensions', () => {
        expect(computeScrollIntoView({ selectedIndex: -1, itemHeight: ITEM, currentScrollY: 0, viewportHeight: VIEWPORT })).toBeNull();
        expect(computeScrollIntoView({ selectedIndex: 3, itemHeight: 0, currentScrollY: 0, viewportHeight: VIEWPORT })).toBeNull();
        expect(computeScrollIntoView({ selectedIndex: 3, itemHeight: ITEM, currentScrollY: 0, viewportHeight: 0 })).toBeNull();
    });
});
