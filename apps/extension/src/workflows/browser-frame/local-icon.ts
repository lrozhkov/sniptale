import { sanitizeWebSnapshotSvgText } from '../../features/web-snapshot/sanitize-svg';
import { rasterizeWindowHeaderIcon } from './icon-raster';

export const WINDOW_HEADER_ICON_ACCEPT =
  '.ico,.png,.svg,.webp,.jpg,.jpeg,image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml,image/webp,image/jpeg';
const MAX_ICON_BYTES = 2 * 1024 * 1024;

function rasterMime(bytes: Uint8Array): string | null {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'image/x-icon';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? 'image/webp' : null;
}

function prepareIconSvg(text: string): string {
  const clean = sanitizeWebSnapshotSvgText(text);
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  if (doc.querySelectorAll('*').length > 2000) throw new Error('Icon SVG exceeds complexity limit');
  const root = doc.documentElement;
  const view = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  for (const [name, fallback] of [
    ['width', view?.[2]],
    ['height', view?.[3]],
  ] as const) {
    const explicit = root.getAttribute(name)?.replace(/px$/, '');
    const size = explicit && /^[\d.]+$/.test(explicit) ? Number(explicit) : fallback;
    if (!size || !Number.isFinite(size) || size > 4096 || size < 1)
      throw new Error('Unsupported icon dimensions');
    root.setAttribute(name, String(size));
  }
  return new XMLSerializer().serializeToString(root);
}

/** Local files are bounded and SVG is made passive before decoding; no original file is published. */
export async function importWindowHeaderIcon(
  file: File,
  signal: AbortSignal
): Promise<string | null> {
  signal.throwIfAborted();
  if (!file.size || file.size > MAX_ICON_BYTES) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  const mime = rasterMime(bytes);
  if (mime) return rasterizeWindowHeaderIcon(new Blob([bytes], { type: mime }), signal);
  if (file.type !== 'image/svg+xml' && !/\.svg$/i.test(file.name)) return null;
  const svg = prepareIconSvg(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  signal.throwIfAborted();
  return rasterizeWindowHeaderIcon(new Blob([svg], { type: 'image/svg+xml' }), signal);
}
