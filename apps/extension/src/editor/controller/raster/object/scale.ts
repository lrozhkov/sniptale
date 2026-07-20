import type { FabricObject } from 'fabric';

export function getReplacementScale(
  source: FabricObject,
  bitmap: HTMLCanvasElement,
  axis: 'x' | 'y'
): number {
  const sourceScale = axis === 'x' ? (source.scaleX ?? 1) : (source.scaleY ?? 1);
  const bitmapSize = axis === 'x' ? bitmap.width : bitmap.height;
  if (bitmapSize <= 0) {
    return sourceScale;
  }

  const readScaledSize = axis === 'x' ? source.getScaledWidth : source.getScaledHeight;
  const baseSize = axis === 'x' ? (source.width ?? bitmapSize) : (source.height ?? bitmapSize);
  const scaledSize =
    typeof readScaledSize === 'function' ? readScaledSize.call(source) : baseSize * sourceScale;
  return scaledSize / bitmapSize;
}
