/**
 * Compute the vertical scroll offset needed to bring a fixed-height list item
 * into view within a scroll viewport.
 *
 * Used to keep the keyboard-selected item visible in overflowing autocomplete /
 * suggestion overlays (the ScrollView only shows a few items at a time).
 *
 * @returns the new scrollY to apply, or null if the item is already fully visible
 *          (or the inputs are not actionable).
 */
export function computeScrollIntoView(params: {
    selectedIndex: number;
    itemHeight: number;
    currentScrollY: number;
    viewportHeight: number;
}): number | null {
    const { selectedIndex, itemHeight, currentScrollY, viewportHeight } = params;

    if (selectedIndex < 0 || itemHeight <= 0 || viewportHeight <= 0) {
        return null;
    }

    const itemTop = selectedIndex * itemHeight;
    const itemBottom = itemTop + itemHeight;

    if (itemTop < currentScrollY) {
        // Item is above the viewport → align it to the top.
        return itemTop;
    }

    if (itemBottom > currentScrollY + viewportHeight) {
        // Item is below the viewport → align it to the bottom.
        return itemBottom - viewportHeight;
    }

    // Already fully visible.
    return null;
}
