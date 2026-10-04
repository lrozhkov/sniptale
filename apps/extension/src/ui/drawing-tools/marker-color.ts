import { multiplyColorAlpha, setColorAlpha } from '@sniptale/foundation/color';

export function markerVisibleColor(color: string, opacity: number): string {
  return multiplyColorAlpha(color, opacity) ?? color;
}

export function markerColorAtOpacity(color: string, opacity: number) {
  return { color: setColorAlpha(color, opacity) ?? color, opacity: 1 };
}

export function markerColorPatch(color: string) {
  return { color, opacity: 1 };
}
