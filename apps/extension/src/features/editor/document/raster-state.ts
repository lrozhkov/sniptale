/** Binary resources retained by an editable raster object. */
export const EDITOR_RASTER_BINARY_FIELDS = [
  'sniptaleRasterOriginalData',
  'sniptaleRasterColorData',
  'sniptaleRasterVisibilityData',
  'sniptaleRasterKeyData',
] as const;

/** Source bitmap dimensions and the visible rectangle in source pixels. */
export interface EditorRasterState {
  version: 1;
  width: number;
  height: number;
  crop: { x: number; y: number; width: number; height: number };
}

/** Accepted raster state; missing optional resources use the original or default mask. */
export interface EditorRasterMetadata {
  sniptaleRasterState: EditorRasterState;
  sniptaleRasterOriginalData: string;
  sniptaleRasterColorData?: string;
  sniptaleRasterVisibilityData?: string;
  sniptaleRasterKeyData?: string;
}

type ResourceValidator = (value: unknown, kind: 'image' | 'mask') => value is string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPixel(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= 32768;
}

/** Detect partial metadata too, so malformed retained resources cannot become legacy data. */
export function hasEditorRasterMetadata(value: unknown): boolean {
  return (
    isRecord(value) &&
    ('sniptaleRasterState' in value || EDITOR_RASTER_BINARY_FIELDS.some((field) => field in value))
  );
}

/** Validate source geometry and resource policy supplied by the receiving boundary. */
export function parseEditorRasterMetadata(
  value: unknown,
  isResource: ResourceValidator
): EditorRasterMetadata | null {
  if (!isRecord(value)) return null;
  const state = value['sniptaleRasterState'];
  if (!isRecord(state) || state['version'] !== 1) return null;
  const { width, height, crop } = state;
  if (!isPixel(width, 1) || !isPixel(height, 1) || width * height > 100000000 || !isRecord(crop))
    return null;
  const { x, y, width: cropWidth, height: cropHeight } = crop;
  if (
    !isPixel(x, 0) ||
    !isPixel(y, 0) ||
    !isPixel(cropWidth, 1) ||
    !isPixel(cropHeight, 1) ||
    x + cropWidth > width ||
    y + cropHeight > height
  )
    return null;
  const original = value['sniptaleRasterOriginalData'];
  if (!isResource(original, 'image')) return null;
  const result: EditorRasterMetadata = {
    sniptaleRasterState: {
      version: 1,
      width,
      height,
      crop: { x, y, width: cropWidth, height: cropHeight },
    },
    sniptaleRasterOriginalData: original,
  };
  for (const field of EDITOR_RASTER_BINARY_FIELDS.slice(1)) {
    if (!(field in value)) continue;
    const resource = value[field];
    if (!isResource(resource, field === 'sniptaleRasterColorData' ? 'image' : 'mask')) return null;
    result[field] = resource;
  }
  return result;
}

/** Inspect bounded canvas JSON before resource loading; an empty legacy canvas remains valid. */
export function inspectEditorRasterCanvas(
  value: unknown,
  isResource: ResourceValidator
): { valid: boolean; hasRaster: boolean } {
  if (!isRecord(value)) return { valid: false, hasRaster: false };
  const roots = value['objects'];
  if (roots !== undefined && !Array.isArray(roots)) return { valid: false, hasRaster: false };
  const pending: Array<{ value: unknown; depth: number }> = (roots ?? []).map(
    (object: unknown) => ({ value: object, depth: 0 })
  );
  if (hasEditorRasterMetadata(value)) pending.push({ value, depth: 0 });
  let nodes = 0;
  let hasRaster = false;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++nodes > 20000 || entry.depth > 40 || !isRecord(entry.value))
      return { valid: false, hasRaster };
    if (hasEditorRasterMetadata(entry.value)) {
      hasRaster = true;
      if (!parseEditorRasterMetadata(entry.value, isResource)) return { valid: false, hasRaster };
    }
    const children = entry.value['objects'];
    if (children !== undefined) {
      if (!Array.isArray(children)) return { valid: false, hasRaster };
      for (const child of children) pending.push({ value: child, depth: entry.depth + 1 });
    }
    if (entry.value['clipPath'] !== undefined)
      pending.push({ value: entry.value['clipPath'], depth: entry.depth + 1 });
  }
  return { valid: true, hasRaster };
}
