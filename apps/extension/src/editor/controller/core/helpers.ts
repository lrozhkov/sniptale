import { Group, Textbox, type FabricObject } from 'fabric';
import { CYRILLIC_ALPHABET, LATIN_ALPHABET } from '../../../features/highlighter/contracts';
import { TRANSPARENT_COLOR, isTransparentColor } from '../../document/model';
import { extractBrowserVersion, parseRgbColor } from '../../color/parsing';

export function emptyCanvasJson(): string {
  return JSON.stringify({ version: '7.2.0', objects: [] });
}

export function isTextbox(object: FabricObject): object is Textbox {
  return object instanceof Textbox;
}

export function isGroup(object: FabricObject): object is Group {
  return object instanceof Group;
}

export function getBrowserVersion(): string {
  const agent = navigator.userAgent;
  const edge = extractBrowserVersion(agent, 'Edg/');
  if (edge) return `Edge ${edge}`;
  const yandex = extractBrowserVersion(agent, 'YaBrowser/');
  if (yandex) return `Yandex ${yandex}`;
  const chrome = extractBrowserVersion(agent, 'Chrome/');
  if (chrome) return `Chrome ${chrome}`;
  return navigator.appVersion;
}

export function nextStepLetter(value: string, alphabetKey: 'latin' | 'cyrillic'): string {
  return nextLetter(value, alphabetKey === 'cyrillic' ? CYRILLIC_ALPHABET : LATIN_ALPHABET);
}

export function parseColorForStore(color: unknown, fallback: string): string {
  if (typeof color !== 'string' || color.trim().length === 0) {
    return isTransparentColor(fallback) ? TRANSPARENT_COLOR : fallback;
  }

  const normalized = color.trim().toLowerCase();
  if (isTransparentColor(normalized)) {
    return TRANSPARENT_COLOR;
  }

  const rgba = parseRgbColor(normalized);
  if (!rgba) {
    if (/^#[0-9a-f]{8}$/i.test(normalized)) {
      return normalized.slice(7, 9) === '00' ? TRANSPARENT_COLOR : normalized.slice(0, 7);
    }
    return normalized;
  }

  if (rgba.alpha === 0) {
    return TRANSPARENT_COLOR;
  }

  const { red: r, green: g, blue: b } = rgba;
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement ||
    target.isContentEditable
  );
}

function nextLetter(value: string, alphabet: readonly string[]): string {
  const current = value.trim().toUpperCase();
  const index = alphabet.indexOf(current);
  const [firstLetter] = alphabet;
  if (!firstLetter) {
    return current;
  }

  if (index === -1) {
    return firstLetter;
  }
  return alphabet[(index + 1) % alphabet.length] ?? firstLetter;
}
