export function formatSketchNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export function clampSketchValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createSketchNoise(seed: number, index: number): number {
  const raw = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return (raw - Math.floor(raw)) * 2 - 1;
}
