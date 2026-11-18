export const RANKING_ROW_GAP = 8;

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

export function rankingDragTarget(heights: readonly (number | undefined)[], from: number, dy: number): number {
  const start = heights[from];
  if (start === undefined) return from;
  const direction = dy > 0 ? 1 : -1;
  let distance = 0;
  let previous = start;
  let target = from;
  for (let i = from + direction; i >= 0 && i < heights.length; i += direction) {
    const height = heights[i];
    if (height === undefined) break;
    distance += previous / 2 + RANKING_ROW_GAP + height / 2;
    if (Math.abs(dy) < distance) break;
    target = i;
    previous = height;
  }
  return target;
}
