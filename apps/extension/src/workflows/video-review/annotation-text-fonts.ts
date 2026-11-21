import type { ReviewTextAppearance } from '../../features/video/review/annotation-effects/text-appearance';
import type { ReviewAnnotationTextClip } from '../../features/video/review/annotation-effects/types';

const families = {
  legacy: 'Arial, sans-serif',
  golos: '"Sniptale Text", Arial, sans-serif',
  literata: '"Literata Variable", Georgia, serif',
  'jetbrains-mono': '"JetBrains Mono Variable", "Courier New", monospace',
  oswald: '"Oswald Variable", Arial, sans-serif',
} satisfies Record<ReviewTextAppearance['family'], string>;
type Family = keyof typeof families;
type ResolvedFont = { ready: Promise<void>; available: boolean };
const loaded = new WeakMap<FontFaceSet, Map<string, ResolvedFont>>();

function fontSet() {
  return typeof document === 'undefined' ? undefined : document.fonts;
}

function fontKey(family: Family, weight: number) {
  return `${family}:${weight}`;
}

/** CSS and Canvas use the same locally registered face. */
export function reviewTextPreferredFont(family: Family) {
  return families[family];
}

/** Starts any missing faces once per document and settles their fallback before painting. */
export async function prepareReviewAnnotationTextFonts(
  clips: readonly ReviewAnnotationTextClip[] | undefined,
  signal: AbortSignal
) {
  const fonts = fontSet();
  if (!fonts || !clips?.length) return;
  let entries = loaded.get(fonts);
  if (!entries) {
    entries = new Map();
    loaded.set(fonts, entries);
  }
  const pending = new Set<Promise<void>>();
  for (const clip of clips) {
    const appearance = clip.appearance;
    if (!clip.enabled || !clip.text.trim() || !appearance || appearance.family === 'legacy')
      continue;
    const { family, weight } = appearance;
    const key = fontKey(family, weight);
    let entry = entries.get(key);
    if (!entry) {
      entry = { ready: Promise.resolve(), available: false };
      const resolved = entry;
      resolved.ready = Promise.resolve()
        .then(() => fonts.load(`${weight} 32px ${families[family]}`, 'AaЯя'))
        .then(
          (faces) => {
            resolved.available =
              faces.length === (family === 'golos' ? 1 : 2) &&
              faces.every((face) => face.status === 'loaded');
          },
          () => undefined
        );
      entries.set(key, entry);
    }
    pending.add(entry.ready);
  }
  if (pending.size) await Promise.all(pending);
  signal.throwIfAborted();
}

/** The resolved stack is also part of layout identity, including a failed face's fallback. */
export function reviewAnnotationTextFont(appearance: ReviewTextAppearance, size: number) {
  const { family, weight } = appearance;
  const fonts = fontSet();
  const available = fonts && loaded.get(fonts)?.get(fontKey(family, weight))?.available;
  return `${weight} ${size}px ${available ? families[family] : families.legacy}`;
}
