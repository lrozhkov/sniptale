import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

/** Project-owned decoration; favicon bytes are retained, never a remote image reference. */
export interface WindowHeader {
  kind: 'browser' | 'application';
  style: 'windows' | 'macos' | 'linux';
  theme: 'light' | 'dark';
  title: string;
  url: string;
  faviconEnabled: boolean;
  /** Missing source in older projects means website acquisition. */
  faviconSource?: 'site' | 'file';
  faviconDataUrl?: string;
}

export const DEFAULT_WINDOW_HEADER: WindowHeader = {
  kind: 'browser',
  style: 'windows',
  theme: 'light',
  title: '',
  url: '',
  faviconEnabled: false,
};

/** Only bounded, normalized PNG data is admitted into persisted decoration settings. */
export function isWindowHeaderFavicon(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 90_000 ||
    !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    return false;
  try {
    const bytes = atob(value.slice(value.indexOf(',') + 1));
    if (bytes.length < 33 || bytes.slice(12, 16) !== 'IHDR') return false;
    const readDimension = (offset: number) =>
      bytes.charCodeAt(offset) * 16777216 +
      bytes.charCodeAt(offset + 1) * 65536 +
      bytes.charCodeAt(offset + 2) * 256 +
      bytes.charCodeAt(offset + 3);
    const width = readDimension(16),
      height = readDimension(20);
    return width > 0 && height > 0 && width <= 64 && height <= 64;
  } catch {
    return false;
  }
}

/** Parse at project admission; malformed present settings are never silently discarded. */
export function parseWindowHeader(value: unknown): WindowHeader | null {
  if (!isRecord(value)) return null;
  const { kind, style, theme, title, url, faviconEnabled, faviconDataUrl, faviconSource } = value;
  if (
    (kind !== 'browser' && kind !== 'application') ||
    (style !== 'windows' && style !== 'macos' && style !== 'linux') ||
    (theme !== 'light' && theme !== 'dark') ||
    typeof title !== 'string' ||
    title.length > 512 ||
    /[\uD800-\uDFFF]/u.test(title) ||
    typeof url !== 'string' ||
    url.length > 2048 ||
    /[\uD800-\uDFFF]/u.test(url) ||
    typeof faviconEnabled !== 'boolean' ||
    (faviconDataUrl !== undefined && !isWindowHeaderFavicon(faviconDataUrl)) ||
    (faviconSource !== undefined && faviconSource !== 'site' && faviconSource !== 'file') ||
    (!faviconEnabled && (faviconDataUrl !== undefined || faviconSource !== undefined)) ||
    (faviconSource === 'file' && faviconDataUrl === undefined)
  )
    return null;
  return {
    kind,
    style,
    theme,
    title,
    url,
    faviconEnabled,
    ...(faviconSource === undefined ? {} : { faviconSource }),
    ...(faviconDataUrl === undefined ? {} : { faviconDataUrl }),
  };
}

/** Resolution follows source height; width changes reflow free space, except below the 480-unit layout minimum. */
export function windowHeaderGeometry(
  header: Pick<WindowHeader, 'kind' | 'style'>,
  source: { width: number; height: number }
) {
  const scale = Math.max(0.001, Math.min(source.width / 480, source.height / 900));
  const baseHeight =
    header.kind === 'browser'
      ? 86
      : header.style === 'macos'
        ? 28
        : header.style === 'linux'
          ? 46
          : 32;
  return {
    width: source.width,
    height: baseHeight * scale,
    scale,
    layoutWidth: source.width / scale,
  };
}
