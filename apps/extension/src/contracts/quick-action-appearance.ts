import { readImageDataUrlDimensions } from '@sniptale/runtime-contracts/validation/data-url';
import { createSolidPaint, parsePaint, type Paint } from '@sniptale/foundation/paint';
import { parseWindowHeader, type WindowHeader } from '@sniptale/runtime-contracts/window-header';

export interface QuickActionAppearance {
  header: WindowHeader | null;
  titleSource: 'page' | 'static';
  addressSource: 'page' | 'static';
  faviconMode: 'page' | 'upload' | 'website';
  faviconWebsite: string;
  background: {
    kind: 'none' | 'paint' | 'image';
    paint: Paint;
    imageDataUrl?: string;
    fit: 'cover' | 'contain';
    padding: number;
    radius: number;
    shadow: number;
  };
  information: {
    enabled: boolean;
    position: 'above' | 'below';
    title: boolean;
    url: boolean;
    date: boolean;
    dimensions: boolean;
    text: string;
    color: string;
    size: number;
  };
}

export function createQuickActionAppearance(): QuickActionAppearance {
  return {
    header: null,
    titleSource: 'page',
    addressSource: 'page',
    faviconMode: 'page',
    faviconWebsite: '',
    background: {
      kind: 'none',
      paint: createSolidPaint('#f1f5f9'),
      fit: 'cover',
      padding: 32,
      radius: 12,
      shadow: 16,
    },
    information: {
      enabled: false,
      position: 'below',
      title: true,
      url: false,
      date: false,
      dimensions: false,
      text: '',
      color: '#334155ff',
      size: 16,
    },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function bounded(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function text(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length <= limit && !/[\uD800-\uDFFF]/u.test(value);
}

/** Presets retain only bounded raster artwork; remote backgrounds are not admitted. */
export function parseQuickActionAppearance(value: unknown): QuickActionAppearance | null {
  if (!record(value) || !record(value['background']) || !record(value['information'])) return null;
  const header = value['header'] === null ? null : parseWindowHeader(value['header']);
  const background = value['background'];
  const information = value['information'];
  const paint = parsePaint(background['paint']);
  const color = parsePaint({ kind: 'solid', color: information['color'] });
  if (
    (value['header'] !== null && !header) ||
    (value['titleSource'] !== 'page' && value['titleSource'] !== 'static') ||
    (value['addressSource'] !== 'page' && value['addressSource'] !== 'static') ||
    (value['faviconMode'] !== 'page' &&
      value['faviconMode'] !== 'upload' &&
      value['faviconMode'] !== 'website') ||
    !text(value['faviconWebsite'], 2048) ||
    (background['kind'] !== 'none' &&
      background['kind'] !== 'paint' &&
      background['kind'] !== 'image') ||
    !paint ||
    (paint.kind === 'gradient' && paint.gradient.type !== 'linear') ||
    (background['fit'] !== 'cover' && background['fit'] !== 'contain') ||
    !bounded(background['padding'], 0, 256) ||
    !bounded(background['radius'], 0, 256) ||
    !bounded(background['shadow'], 0, 128) ||
    (background['imageDataUrl'] !== undefined &&
      (!text(background['imageDataUrl'], 2_796_260) ||
        !readImageDataUrlDimensions(background['imageDataUrl'], 2 * 1024 * 1024))) ||
    (background['kind'] === 'image' && background['imageDataUrl'] === undefined) ||
    typeof information['enabled'] !== 'boolean' ||
    (information['position'] !== 'above' && information['position'] !== 'below') ||
    !['title', 'url', 'date', 'dimensions'].every((key) => typeof information[key] === 'boolean') ||
    !text(information['text'], 2048) ||
    !color ||
    color.kind !== 'solid' ||
    !bounded(information['size'], 10, 48)
  )
    return null;
  return {
    header,
    titleSource: value['titleSource'],
    addressSource: value['addressSource'],
    faviconMode: value['faviconMode'] as QuickActionAppearance['faviconMode'],
    faviconWebsite: value['faviconWebsite'],
    background: {
      kind: background['kind'] as QuickActionAppearance['background']['kind'],
      paint,
      fit: background['fit'],
      padding: background['padding'],
      radius: background['radius'],
      shadow: background['shadow'],
      ...(background['imageDataUrl'] === undefined
        ? {}
        : { imageDataUrl: background['imageDataUrl'] as string }),
    },
    information: {
      enabled: information['enabled'],
      position: information['position'],
      title: information['title'] as boolean,
      url: information['url'] as boolean,
      date: information['date'] as boolean,
      dimensions: information['dimensions'] as boolean,
      text: information['text'],
      color: color.color,
      size: information['size'],
    },
  };
}

/** Settings transfer excludes embedded media, while retaining valid decorative controls. */
export function projectQuickActionAppearanceForTransfer(
  appearance: QuickActionAppearance
): QuickActionAppearance {
  const { imageDataUrl: _image, ...background } = appearance.background;
  let header = appearance.header;
  if (header?.faviconDataUrl) {
    const { faviconDataUrl: _icon, faviconSource: _source, ...rest } = header;
    header = { ...rest, faviconEnabled: false };
  }
  return {
    ...appearance,
    header,
    background: { ...background, kind: background.kind === 'image' ? 'none' : background.kind },
  };
}

export function hasQuickActionArtwork(appearance: QuickActionAppearance): boolean {
  return (
    appearance.background.imageDataUrl !== undefined ||
    appearance.header?.faviconDataUrl !== undefined
  );
}
