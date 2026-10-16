import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { resolveContentShadowRoot } from '../../platform/dom-host';

const BUNDLED_FONT_FAMILIES = new Set(['Sniptale Interface', 'Sniptale Text']);
const installationByDocument = new WeakMap<
  Document,
  { root: ShadowRoot; promise: Promise<void>; installed: boolean }
>();

type FontDependencies = {
  createFace(family: string, source: string, descriptors: FontFaceDescriptors): FontFace;
};
const defaultDependencies: FontDependencies = {
  createFace: (family, source, descriptors) => new FontFace(family, source, descriptors),
};

function isLiveRoot(root: ShadowRoot): boolean {
  return root.host.isConnected && resolveContentShadowRoot() === root;
}

function readSingleFontSource(source: string): string | null {
  if (!source.startsWith('url(')) return null;
  const quote = source[4];
  const quoted = quote === '"' || quote === "'";
  const valueEnd = quoted ? source.indexOf(quote, 5) : source.indexOf(')', 4);
  if (valueEnd < 0) return null;
  const closing = quoted ? valueEnd + 1 : valueEnd;
  if (source[closing] !== ')') return null;
  const value = source.slice(quoted ? 5 : 4, valueEnd);
  if (!value || (!quoted && /[\s"'()]/u.test(value))) return null;
  const suffix = source.slice(closing + 1).trim();
  if (suffix) {
    if (!suffix.startsWith('format(') || !suffix.endsWith(')')) return null;
    const format = suffix.slice(7, -1);
    const formatQuote = format[0];
    if (formatQuote !== '"' && formatQuote !== "'") return null;
    if (format.at(-1) !== formatQuote) return null;
    const content = format.slice(1, -1);
    if (!content || content.includes(formatQuote)) return null;
  }
  return value;
}

function hasBundledSource(source: string): boolean {
  // The trusted stylesheet declares one URL per face; reject fallback lists and host URLs.
  const sourceUrl = readSingleFontSource(source);
  if (!sourceUrl) return false;
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== 'chrome-extension:' || !url.pathname.endsWith('.woff2')) return false;
    if (url.search || url.hash) return false;
    // Resolve the exact WAR resource: directory URLs need not use the resource's dynamic origin.
    return sourceUrl === runtimeInfo.getURL(url.pathname.slice(1));
  } catch {
    return false;
  }
}

/** Registers only the bundled UI and authored-text declarations from the attached content stylesheet. */
export function installContentInterfaceFonts(
  root: ShadowRoot,
  dependencies: FontDependencies = defaultDependencies
): Promise<void> {
  if (!isLiveRoot(root)) return Promise.resolve();
  const owner = root.ownerDocument;
  const existing = installationByDocument.get(owner);
  if (existing?.installed || existing?.root === root) return existing.promise;
  const sheet = root.querySelector('style')?.sheet;
  if (!sheet || !owner.fonts) return Promise.resolve();
  const rules = Array.from(sheet.cssRules).filter(
    (rule): rule is CSSFontFaceRule => rule.type === CSSRule.FONT_FACE_RULE
  );
  const declarations = rules.flatMap((rule) => {
    const family = rule.style.getPropertyValue('font-family').replace(/^["']|["']$/gu, '');
    const source = rule.style.getPropertyValue('src').trim();
    if (!BUNDLED_FONT_FAMILIES.has(family) || !hasBundledSource(source)) return [];
    return [
      {
        family,
        source,
        descriptors: {
          display: rule.style.getPropertyValue('font-display') as FontDisplay,
          style: rule.style.getPropertyValue('font-style'),
          weight: rule.style.getPropertyValue('font-weight'),
          unicodeRange: rule.style.getPropertyValue('unicode-range') || 'U+0-10FFFF',
        },
      },
    ];
  });
  if (declarations.length === 0) return Promise.resolve();
  const entry = { root, installed: false, promise: Promise.resolve() };
  entry.promise = Promise.resolve()
    .then(async () => {
      if (!isLiveRoot(root)) return [];
      const faces = declarations.map(({ family, source, descriptors }) =>
        dependencies.createFace(family, source, descriptors)
      );
      await Promise.all(faces.map((face) => face.load()));
      return faces;
    })
    .then((faces) => {
      if (!isLiveRoot(root)) {
        if (installationByDocument.get(owner) === entry) installationByDocument.delete(owner);
        return;
      }
      for (const face of faces) owner.fonts.add(face);
      entry.installed = true;
    })
    .catch((error: unknown) => {
      if (installationByDocument.get(owner) === entry) installationByDocument.delete(owner);
      throw error;
    });
  installationByDocument.set(owner, entry);
  return entry.promise;
}
