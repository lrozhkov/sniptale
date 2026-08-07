import { runtimeInfo } from '@sniptale/platform/browser/runtime';

const FRAME_CALLOUT_HANDWRITTEN_FONT_FAMILY = 'Sniptale Handwritten';
const FONT_ASSETS = [
  {
    path: 'fonts/marck-script-cyrillic-400-normal.woff2',
    unicodeRange: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
  },
  {
    path: 'fonts/marck-script-latin-400-normal.woff2',
    unicodeRange:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,' +
      'U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,' +
      'U+2212,U+2215,U+FEFF,U+FFFD',
  },
] as const;

export interface FrameCalloutFontFace {
  load(): Promise<FrameCalloutFontFace>;
}

export interface FrameCalloutFontOwner {
  fonts: { add(face: FrameCalloutFontFace): unknown };
}

type FontInstallerDependencies = {
  createFace: (source: ArrayBuffer, unicodeRange: string) => FrameCalloutFontFace;
  fetchAsset: (url: string) => Promise<ArrayBuffer>;
  resolveAssetUrl: (path: string) => string;
};

const installationByDocument = new WeakMap<object, Promise<void>>();

const defaultDependencies: FontInstallerDependencies = {
  createFace: (source, unicodeRange) =>
    new FontFace(FRAME_CALLOUT_HANDWRITTEN_FONT_FAMILY, source, {
      display: 'block',
      style: 'normal',
      weight: '400',
      unicodeRange,
    }),
  fetchAsset: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Frame annotation font request failed (${response.status})`);
    return response.arrayBuffer();
  },
  resolveAssetUrl: (path) => runtimeInfo.getURL(path),
};

export function getFrameCalloutHandwrittenFontSources(): Array<{
  family: string;
  src: string;
  style: 'normal';
  weight: '400';
}> {
  return FONT_ASSETS.map((asset) => ({
    family: FRAME_CALLOUT_HANDWRITTEN_FONT_FAMILY,
    src: runtimeInfo.getURL(asset.path),
    style: 'normal',
    weight: '400',
  }));
}

/** Installs the bundled face into the actual document that owns the rendered surface. */
export function installFrameCalloutHandwrittenFont(
  owner: FrameCalloutFontOwner,
  dependencies: FontInstallerDependencies = defaultDependencies
): Promise<void> {
  const key = owner as object;
  const existing = installationByDocument.get(key);
  if (existing) return existing;
  const installation = install(owner, dependencies).catch((error) => {
    installationByDocument.delete(key);
    throw error;
  });
  installationByDocument.set(key, installation);
  return installation;
}

async function install(
  owner: FrameCalloutFontOwner,
  dependencies: FontInstallerDependencies
): Promise<void> {
  const faces = await Promise.all(
    FONT_ASSETS.map(async (asset) => {
      const source = await dependencies.fetchAsset(dependencies.resolveAssetUrl(asset.path));
      return dependencies.createFace(source, asset.unicodeRange);
    })
  );
  await Promise.all(faces.map((face) => face.load()));
  for (const face of faces) owner.fonts.add(face);
}
