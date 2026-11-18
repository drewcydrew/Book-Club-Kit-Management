export const RANKING_ROW_GAP = 8;

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
