export const SCHEDULE_DESKTOP_WIDTH = 1200;
export const SCHEDULE_CLUB_WIDTH = 140;

export function scheduleGridSizing(containerWidth: number, wide: boolean) {
  if (!wide) return { cellWidth: 96, gap: 8 };
  const gap = 6;
  const cellWidth = containerWidth > 0
    ? Math.max(72, Math.min(96, Math.floor((containerWidth - SCHEDULE_CLUB_WIDTH - 11 * gap) / 12)))
    : 84;
  return { cellWidth, gap };
}
