// RFC 5646 section 2.1: the registered grandfathered grammar alternatives.
const grandfathered = new Set([
  'en-gb-oed',
  'i-ami',
  'i-bnn',
  'i-default',
  'i-enochian',
  'i-hak',
  'i-klingon',
  'i-lux',
  'i-mingo',
  'i-navajo',
  'i-pwn',
  'i-tao',
  'i-tay',
  'i-tsu',
  'sgn-be-fr',
  'sgn-be-nl',
  'sgn-ch-de',
  'art-lojban',
  'cel-gaulish',
  'no-bok',
  'no-nyn',
  'zh-guoyu',
  'zh-hakka',
  'zh-min',
  'zh-min-nan',
  'zh-xiang',
]);
const letters = /^[a-z]+$/;
const alphanumeric = /^[a-z0-9]+$/;

/** Bounded, forward-only RFC 5646 parser; independent of the installed locale registry. */
export function isEffectV1LocaleTag(value: string): boolean {
  if (!value || value.length > 64) return false;
  const tag = value.toLowerCase();
  if (grandfathered.has(tag)) return true;
  const parts = tag.split('-');
  if (parts.some((part) => !part || part.length > 8 || !alphanumeric.test(part))) return false;
  if (parts[0] === 'x') return parts.length > 1;
  const language = parts[0]!;
  if (language.length < 2 || !letters.test(language)) return false;
  let cursor = 1;
  if (language.length <= 3) {
    let extlangs = 0;
    while (extlangs < 3 && parts[cursor]?.length === 3 && letters.test(parts[cursor]!)) {
      cursor++;
      extlangs++;
    }
  }
  if (parts[cursor]?.length === 4 && letters.test(parts[cursor]!)) cursor++;
  const region = parts[cursor];
  if (region && ((region.length === 2 && letters.test(region)) || /^[0-9]{3}$/.test(region)))
    cursor++;
  const variants = new Set<string>();
  while (parts[cursor] && isVariant(parts[cursor]!)) {
    const variant = parts[cursor++]!;
    if (variants.has(variant)) return false;
    variants.add(variant);
  }
  return validExtensions(parts, cursor);
}

function isVariant(part: string): boolean {
  return part.length >= 5 || /^[0-9][a-z0-9]{3}$/.test(part);
}

function validExtensions(parts: string[], start: number): boolean {
  const extensions = new Set<string>();
  let cursor = start;
  while (cursor < parts.length) {
    const singleton = parts[cursor++]!;
    if (singleton === 'x') return cursor < parts.length;
    if (singleton.length !== 1 || extensions.has(singleton)) return false;
    extensions.add(singleton);
    const first = cursor;
    while (cursor < parts.length && parts[cursor]!.length >= 2) cursor++;
    if (cursor === first) return false;
  }
  return true;
}
