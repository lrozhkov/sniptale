interface Size {
  width: number;
  height: number;
}
interface Allocation {
  role: string;
  bytes: number;
  canvases: number;
}
function checked(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error('Invalid preview allocation graph');
  return value;
}
function pixels(size: Size): number {
  return checked(checked(size.width) * checked(size.height));
}
function bytes(role: string, count: number): Allocation {
  return { role, bytes: checked(count), canvases: 0 };
}
function canvas(role: string, size: Size): Allocation {
  return { ...bytes(role, pixels(size) * 4), canvases: 1 };
}

/** Declares explicit spatial surfaces, texture levels, drawing buffer and matrix storage. */
export function calculateSpatialRenderAllocations(
  value: { output: Size; plane: Size; halfFloat: boolean } | null
): Allocation[] {
  if (!value) return [];
  const { output, plane, halfFloat } = value;
  const result = [
    canvas('spatial-plane', plane),
    ...['exposure', 'overlay'].map((role) => canvas(`spatial-${role}`, output)),
  ];
  result.push(
    bytes('spatial-drawing-buffer', pixels(output) * 4),
    bytes('spatial-vertex-and-matrices', 132),
    bytes('spatial-level-sizes', 64)
  );
  let { width, height } = plane;
  for (let level = 0; level < 8; level++) {
    result.push(
      bytes(
        `spatial-texture-${level}`,
        pixels({ width, height }) * (level > 0 && halfFloat ? 8 : 4)
      )
    );
    width = Math.max(1, Math.ceil(width / 2));
    height = Math.max(1, Math.ceil(height / 2));
  }
  return result;
}
