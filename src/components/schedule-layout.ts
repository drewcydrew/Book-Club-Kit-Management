export const SCHEDULE_DESKTOP_WIDTH = 1200;
export const SCHEDULE_CLUB_WIDTH = 140;

export const SCHEDULE_ROW_GAP = 16;
export const SCHEDULE_CELL_LABEL_HEIGHT = 20;

export function scheduleCoverHeight(cellWidth: number) {
  return cellWidth * 1.5;
}

// Fixed so the club column and the shared scroller rows stay aligned, and highlight path stops can be computed.
export function scheduleRowHeight(cellWidth: number) {
  return SCHEDULE_CELL_LABEL_HEIGHT + scheduleCoverHeight(cellWidth) + 32;
}

export function scheduleGridSizing(containerWidth: number, wide: boolean) {
  if (!wide) return { cellWidth: 96, gap: 8 };
  const gap = 6;
  const cellWidth = containerWidth > 0
    ? Math.max(72, Math.min(96, Math.floor((containerWidth - SCHEDULE_CLUB_WIDTH - 11 * gap) / 12)))
    : 84;
  return { cellWidth, gap };
}
