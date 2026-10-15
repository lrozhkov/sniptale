import { sanitizeWebSnapshotSvgText } from '../../features/web-snapshot/sanitize-svg';

export const BACKGROUND_IMAGE_ACCEPT =
  'image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml';
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

function assertDimensions(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    width * height > MAX_PIXELS
  )
    throw new Error('Unsupported background dimensions');
}

/** Prepare a passive SVG with explicit bounded dimensions before browser decoding. */
export function prepareBackgroundSvg(text: string): string {
  if (text.length > 2 * 1024 * 1024) throw new Error('Background SVG exceeds size limit');
  const clean = sanitizeWebSnapshotSvgText(text);
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelectorAll('*').length > 10000)
    throw new Error('Background SVG exceeds complexity limit');
  const view = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const length = (name: string, fallback: number | undefined) => {
    const value = root.getAttribute(name);
    if (!value) return fallback;
    const numeric = value.endsWith('px') ? value.slice(0, -2) : value;
    const parts = numeric.split('.');
    const decimal = parts.length <= 2 && parts.every((part) => /^[0-9]+$/.test(part));
    return decimal ? Number(numeric) : fallback;
  };
  const width = length('width', view?.[2]);
  const height = length('height', view?.[3]);
  if (width === undefined || height === undefined)
    throw new Error('Missing background SVG dimensions');
  assertDimensions(width, height);
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  return new XMLSerializer().serializeToString(root);
}

/** SVG is rasterized once so all editor previews, projects and exporters use the same pixels. */
export async function prepareBackgroundImage(file: File, signal?: AbortSignal): Promise<File> {
  signal?.throwIfAborted();
  if (
    !BACKGROUND_IMAGE_ACCEPT.split(',').includes(file.type) ||
    !file.size ||
    file.size > MAX_BYTES
  )
    throw new Error('Unsupported background image');
  if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    const bitmap = await createImageBitmap(file);
    try {
      assertDimensions(bitmap.width, bitmap.height);
      signal?.throwIfAborted();
    } finally {
      bitmap.close();
    }
    return file;
  }
  const svg = file.type === 'image/svg+xml';
  const input = svg
    ? new Blob([prepareBackgroundSvg(await file.text())], { type: file.type })
    : file;
  signal?.throwIfAborted();
  const url = URL.createObjectURL(input);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    signal?.throwIfAborted();
    assertDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Background raster unavailable');
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Background encoding failed'))),
        'image/png'
      )
    );
    signal?.throwIfAborted();
    if (blob.size > MAX_BYTES) throw new Error('Background raster exceeds size limit');
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
