export type GridRect = { left: number; top: number; width: number; height: number };

// Picks the grid slot under the pointer, or the nearest slot when the pointer is between or outside cards.
export function rankingGridTarget(rects: readonly (GridRect | undefined)[], from: number, x: number, y: number): number {
  let target = from;
  let best = Infinity;
  rects.forEach((rect, index) => {
    if (!rect) return;
    if (x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height) {
      best = -1;
      target = index;
      return;
    }
    if (best === -1) return;
    const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
    if (distance < best) {
      best = distance;
      target = index;
    }
  });
  return target;
}
