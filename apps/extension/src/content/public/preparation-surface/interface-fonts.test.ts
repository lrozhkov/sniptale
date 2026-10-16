// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { initializeContentUiRoots } from '../../platform/dom-host';
import { installContentInterfaceFonts } from './interface-fonts';

const { getURL } = vi.hoisted(() => ({ getURL: vi.fn() }));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getURL },
}));

beforeEach(() => {
  getURL.mockReset().mockImplementation((path: string) => `chrome-extension://owned/${path}`);
});

function createRoot(
  rules: CSSFontFaceRule[],
  owner = document.implementation.createHTMLDocument()
) {
  const host = owner.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const style = owner.createElement('style');
  // jsdom drops FontFace descriptors; native CSSOM descriptor availability has separate browser proof.
  Object.defineProperty(style, 'sheet', { value: { cssRules: rules } });
  root.append(style);
  owner.body.append(host);
  initializeContentUiRoots(root);
  const add = vi.fn();
  Object.defineProperty(owner, 'fonts', { configurable: true, value: { add } });
  return { root, add };
}

function declaration(
  source: string,
  family = 'Sniptale Interface',
  weight = '100 900'
): CSSFontFaceRule {
  const properties: Record<string, string> = {
    'font-family': `"${family}"`,
    src: source,
    'font-weight': weight,
    'font-style': 'normal',
    'font-display': 'swap',
    'unicode-range': 'U+0400-045F',
  };
  return {
    type: CSSRule.FONT_FACE_RULE,
    style: { getPropertyValue: (name: string) => properties[name] ?? '' },
  } as CSSFontFaceRule;
}

function face(load = () => Promise.resolve()) {
  const value = { load: vi.fn(load) };
  return value as unknown as FontFace;
}

it('loads the trusted CSSOM descriptors once per document and leaves authored fonts alone', async () => {
  const { root, add } = createRoot([
    declaration(
      'url("chrome-extension://owned/assets/inter-cyrillic-wght-normal.woff2") format("woff2")'
    ),
    declaration('url("chrome-extension://owned/fonts/marck.woff2")', 'Sniptale Handwritten'),
  ]);
  const loaded = face();
  const createFace = vi.fn(() => loaded);
  const first = installContentInterfaceFonts(root, { createFace });
  expect(installContentInterfaceFonts(root, { createFace })).toBe(first);
  await first;
  expect(createFace).toHaveBeenCalledExactlyOnceWith(
    'Sniptale Interface',
    'url("chrome-extension://owned/assets/inter-cyrillic-wght-normal.woff2") format("woff2")',
    { weight: '100 900', style: 'normal', display: 'swap', unicodeRange: 'U+0400-045F' }
  );
  expect(add).toHaveBeenCalledExactlyOnceWith(loaded);
  await installContentInterfaceFonts(root, { createFace });
  expect(createFace).toHaveBeenCalledOnce();
});

it.each([
  'url("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2")',
  'url("https://host.test/inter.woff2")',
  'url("chrome-extension://other/assets/inter.woff2")',
  'url("chrome-extension://owned/assets/inter.woff2"), url("https://host.test/fallback.woff2")',
])('never loads an unresolved or foreign source: %s', async (source) => {
  const { root, add } = createRoot([declaration(source)]);
  const createFace = vi.fn(() => face());
  await installContentInterfaceFonts(root, { createFace });
  expect(createFace).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
});

it('removes a failed installation so a supported reinjection can retry', async () => {
  const { root, add } = createRoot([
    declaration('url("chrome-extension://owned/assets/inter-latin-wght-normal.woff2")'),
  ]);
  const createFace = vi
    .fn()
    .mockReturnValueOnce(face(() => Promise.reject(new Error('font unavailable'))))
    .mockReturnValueOnce(face());
  await expect(installContentInterfaceFonts(root, { createFace })).rejects.toThrow(
    'font unavailable'
  );
  expect(add).not.toHaveBeenCalled();
  await installContentInterfaceFonts(root, { createFace });
  expect(createFace).toHaveBeenCalledTimes(2);
  expect(add).toHaveBeenCalledOnce();
});

it('does not register a delayed face after its root retires or suppress a new root installation', async () => {
  const rules = [
    declaration('url("chrome-extension://owned/assets/inter-latin-wght-normal.woff2")'),
  ];
  const { root, add: oldAdd } = createRoot(rules);
  let complete!: () => void;
  const pendingLoad = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const oldFace = face(() => pendingLoad);
  const oldInstall = installContentInterfaceFonts(root, { createFace: () => oldFace });
  await Promise.resolve();
  expect(oldFace.load).toHaveBeenCalledOnce();
  root.host.remove();
  const { root: currentRoot, add } = createRoot(rules, root.ownerDocument);
  const currentFace = face();
  await installContentInterfaceFonts(currentRoot, { createFace: () => currentFace });
  complete();
  await oldInstall;
  expect(oldAdd).not.toHaveBeenCalled();
  expect(add).toHaveBeenCalledExactlyOnceWith(currentFace);
  expect(add).not.toHaveBeenCalledWith(oldFace);
});

it('skips unavailable runtime resolution without caching success or contacting the host', async () => {
  const { root, add } = createRoot([
    declaration('url("chrome-extension://owned/assets/inter-latin-wght-normal.woff2")'),
  ]);
  const createFace = vi.fn(() => face());
  getURL.mockImplementationOnce(() => {
    throw new Error('runtime unavailable');
  });
  await installContentInterfaceFonts(root, { createFace });
  expect(createFace).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
  await installContentInterfaceFonts(root, { createFace });
  expect(getURL).toHaveBeenLastCalledWith('assets/inter-latin-wght-normal.woff2');
  expect(add).toHaveBeenCalledOnce();
});

it.each([
  'fonts/manrope-latin-wght-normal.woff2',
  'node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2',
])(
  'supports replacing the stable Interface alias with an existing bundled family: %s',
  async (path) => {
    const source = `url("chrome-extension://owned/${path}") format("woff2-variations")`;
    const { root, add } = createRoot([
      declaration(source, 'Sniptale Interface', '200 800'),
      declaration(source, 'Sniptale Sans', '200 800'),
      declaration(
        'url("chrome-extension://owned/fonts/marck.woff2")',
        'Sniptale Handwritten',
        '400'
      ),
    ]);
    const loaded = face();
    const createFace = vi.fn(() => loaded);
    await installContentInterfaceFonts(root, { createFace });
    expect(createFace).toHaveBeenCalledExactlyOnceWith('Sniptale Interface', source, {
      weight: '200 800',
      style: 'normal',
      display: 'swap',
      unicodeRange: 'U+0400-045F',
    });
    expect(add).toHaveBeenCalledExactlyOnceWith(loaded);
  }
);

it.each([
  'url("chrome-extension://owned/fonts/font.woff2?token=secret")',
  'url("chrome-extension://owned/fonts/font.woff2#fragment")',
  'url("chrome-extension://owned/fonts/not-a-font.js")',
])(
  'rejects noncanonical or nonfont resource sources after family replacement: %s',
  async (source) => {
    const { root, add } = createRoot([declaration(source)]);
    const createFace = vi.fn(() => face());
    await installContentInterfaceFonts(root, { createFace });
    expect(createFace).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  }
);

it.each([
  'url("chrome-extension://owned/fonts/font.woff2") format("woff2"), url("https://host.test/font.woff2")',
  'url("chrome-extension://owned/fonts/font.woff2") format("woff2") format("woff2")',
  'url("chrome-extension://owned/fonts/font.woff2\')',
  'url(chrome-extension://owned/fonts/font .woff2)',
  `url("chrome-extension://owned/fonts/${'invalid'.repeat(2000)}`,
])('rejects malformed source delimiters without trying to load a face: %s', async (source) => {
  const { root, add } = createRoot([declaration(source)]);
  const createFace = vi.fn(() => face());
  await installContentInterfaceFonts(root, { createFace });
  expect(createFace).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
});

it.each([
  'url("chrome-extension://owned/fonts/font.woff2") format("woff2")',
  "url('chrome-extension://owned/fonts/font.woff2') format('woff2-variations')",
  'url(chrome-extension://owned/fonts/font.woff2)',
])('preserves supported single-source CSSOM serialization: %s', async (source) => {
  const { root, add } = createRoot([declaration(source)]);
  const createFace = vi.fn(() => face());
  await installContentInterfaceFonts(root, { createFace });
  expect(createFace).toHaveBeenCalledOnce();
  expect(add).toHaveBeenCalledOnce();
});
