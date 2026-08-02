export type AnchorRect = { x: number; y: number; width: number; height: number };

export function isFinitePositiveRect(rect: AnchorRect): boolean {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}
