/* Lógica pura de navegación entre categorías (secciones) con ↑ / ↓. */

export const STOP_TOLERANCE_PX = 80;

export function resolveNextSectionIndex(
  scrollY: number,
  stops: number[],
  dir: -1 | 1,
  pendingTarget: number | null = null,
): number {
  const last = stops.length - 1;
  if (last <= 0) return 0;
  if (pendingTarget !== null) {
    return Math.max(0, Math.min(last, pendingTarget + dir));
  }
  let closest = 0;
  let minDist = Math.abs(stops[0] - scrollY);
  for (let i = 1; i <= last; i++) {
    const dist = Math.abs(stops[i] - scrollY);
    if (dist < minDist) {
      minDist = dist;
      closest = i;
    }
  }
  if (minDist <= STOP_TOLERANCE_PX) {
    return Math.max(0, Math.min(last, closest + dir));
  }
  if (dir === 1) {
    const next = stops.findIndex((y) => y > scrollY + STOP_TOLERANCE_PX);
    return next === -1 ? last : next;
  }
  for (let i = last; i >= 0; i--) {
    if (stops[i] < scrollY - STOP_TOLERANCE_PX) return i;
  }
  return 0;
}
