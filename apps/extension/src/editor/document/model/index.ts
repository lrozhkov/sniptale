import type { FabricImage, FabricObject } from 'fabric';
import type { EditorObjectType } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { parseRgbColor } from '../../color/parsing';
export { CUSTOM_JSON_PROPS } from './custom-json-props';
export type {
  EditorRenderedImageOptions,
  EditorRenderedImageSize,
  EditorRenderToDataUrlOptions,
} from './render-options';
export type { SourceState } from './source-state';

export const BROWSER_HEADER_HEIGHT = 86;
export const MIN_DRAW_SIZE = 8;
export const MIN_CANVAS_SIZE = 1;
export const TRANSPARENT_COLOR = 'transparent';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isTransparentColor(color: string | null | undefined): boolean {
  if (!color) {
    return true;
  }

  const normalized = color.trim().toLowerCase();
  if (normalized === TRANSPARENT_COLOR || normalized === 'none') {
    return true;
  }

  if (/^#[0-9a-f]{8}$/i.test(normalized)) {
    return normalized.slice(7, 9) === '00';
  }

  const rgbaColor = parseRgbColor(normalized);
  if (!rgbaColor || rgbaColor.alpha === null) {
    return false;
  }

  return rgbaColor.alpha === 0;
}

export function hexToRgba(color: string, opacity: number): string {
  if (isTransparentColor(color)) {
    return TRANSPARENT_COLOR;
  }

  if (color.startsWith('rgba') || color.startsWith('rgb')) {
    return color;
  }

  const normalized = color.replace('#', '');
  const safe =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized.padEnd(6, '0').slice(0, 6);

  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function fontFamilyToCss(fontFamily: string): string {
  switch (fontFamily) {
    case 'serif':
      return 'Georgia, Cambria, "Times New Roman", Times, serif';
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    case 'sans':
    default:
      return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }
}

export function isFrameObject(object: FabricObject): boolean {
  return object.sniptaleRole === 'frame';
}

export function isBrowserFrameObject(object: FabricObject): boolean {
  return object.sniptaleType === 'browser-frame';
}

function isCropGuide(object: FabricObject): boolean {
  return object.sniptaleRole === 'crop-guide';
}

export function isUserObject(object: FabricObject): boolean {
  return !isFrameObject(object) && !isCropGuide(object);
}

export function isEditableObject(object: FabricObject): boolean {
  return isUserObject(object);
}

export function isSourceObject(object: FabricObject): boolean {
  return object.sniptaleType === 'source-image' || object.sniptaleRole === 'source';
}

export function isBackgroundObject(object: FabricObject): boolean {
  return object.sniptaleType === 'background' || object.sniptaleRole === 'background';
}

export function getEditorObjectTypeLabel(type: EditorObjectType): string {
  switch (type) {
    case 'transparent-base':
      return translate('editor.runtime.transparentLayer');
    case 'source-image':
      return translate('editor.runtime.sourceImage');
    case 'background':
      return translate('editor.runtime.background');
    case 'pencil':
      return translate('editor.runtime.pencil');
    case 'highlighter':
      return translate('editor.runtime.highlighter');
    case 'rectangle':
      return translate('editor.runtime.rectangle');
    case 'ellipse':
      return translate('editor.runtime.ellipse');
    case 'rich-shape':
      return translate('editor.runtime.richShape');
    case 'blur':
      return translate('editor.runtime.blur');
    case 'diamond':
      return translate('editor.runtime.diamond');
    case 'arrow':
      return translate('editor.runtime.arrow');
    case 'line':
      return translate('editor.runtime.line');
    case 'text':
      return translate('editor.runtime.text');
    case 'step':
      return translate('editor.runtime.step');
    case 'image':
      return translate('editor.runtime.image');
    case 'browser-frame':
      return translate('editor.runtime.browserFrame');
    case 'meta-stamp':
      return translate('editor.runtime.metaStamp');
    default:
      return translate('editor.runtime.layer');
  }
}

export function createObjectLabel(type: EditorObjectType, index: number): string {
  if (type === 'source-image' || type === 'background') {
    return getEditorObjectTypeLabel(type);
  }

  return `${getEditorObjectTypeLabel(type)} ${index}`;
}

export function getFabricImageIntrinsicSize(image: FabricImage): { width: number; height: number } {
  const element = image.getElement();
  const elementWidth =
    (element instanceof HTMLImageElement ? element.naturalWidth : 0) || element?.width || 0;
  const elementHeight =
    (element instanceof HTMLImageElement ? element.naturalHeight : 0) || element?.height || 0;
  const width = Math.max(1, Math.round(image.width ?? elementWidth ?? 0));
  const height = Math.max(1, Math.round(image.height ?? elementHeight ?? 0));

  return { width, height };
}

export function getSingleSelectionType(objects: FabricObject[]): EditorObjectType | null {
  if (objects.length === 0) {
    return null;
  }

  const uniqueTypes = new Set(
    objects
      .map((object) => object.sniptaleType)
      .filter((type): type is EditorObjectType => Boolean(type))
  );
  const [singleType] = Array.from(uniqueTypes);

  return uniqueTypes.size === 1 ? (singleType ?? null) : null;
}
