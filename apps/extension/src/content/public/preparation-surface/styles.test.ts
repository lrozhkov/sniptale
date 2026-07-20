import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { runtimeInfoGetUrlMock } = vi.hoisted(() => ({
  runtimeInfoGetUrlMock: vi.fn((path: string) => `chrome-extension://sniptale/${path}`),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: runtimeInfoGetUrlMock,
  },
}));

import { createContentEntrypointStyles, resolveContentEntrypointStyleUrls } from './styles';

const STYLES_SOURCE_PATH = fileURLToPath(new URL('./styles.ts', import.meta.url));

afterEach(() => {
  runtimeInfoGetUrlMock.mockClear();
});

describe('content entrypoint styles', () => {
  it('loads the shared style bundle once for the shadow runtime', () => {
    const styles = createContentEntrypointStyles();
    const source = readFileSync(STYLES_SOURCE_PATH, 'utf8');

    expect(styles).toContain(':host {');
    expect(source).toContain('@sniptale/ui/styles?inline');
    expect(source).not.toContain('@sniptale/ui/styles/tailwind?inline');
    expect(source).not.toContain('../../../shared/design-tokens.css?inline');
  });

  it('resolves dev and build font urls through extension runtime URLs', () => {
    const styles = resolveContentEntrypointStyleUrls(
      [
        [
          "src: url('/node_modules/@fontsource-variable/manrope/files/",
          "manrope-latin-wght-normal.woff2') format('woff2-variations');",
        ].join(''),
        [
          "src: url('@fontsource-variable/manrope/files/",
          "manrope-latin-ext-wght-normal.woff2') format('woff2-variations');",
        ].join(''),
        'src: url(./manrope-cyrillic-wght-normal.woff2) format("woff2-variations");',
      ].join('\n')
    );

    expect(styles).toContain(
      [
        'url("chrome-extension://sniptale/node_modules/@fontsource-variable/manrope/files/',
        'manrope-latin-wght-normal.woff2")',
      ].join('')
    );
    expect(styles).toContain(
      'url("chrome-extension://sniptale/fonts/manrope-latin-ext-wght-normal.woff2")'
    );
    expect(styles).toContain(
      'url("chrome-extension://sniptale/fonts/manrope-cyrillic-wght-normal.woff2")'
    );
    expect(runtimeInfoGetUrlMock).toHaveBeenCalledWith(
      'node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2'
    );
    expect(runtimeInfoGetUrlMock).toHaveBeenCalledWith('fonts/manrope-cyrillic-wght-normal.woff2');
    expect(runtimeInfoGetUrlMock).toHaveBeenCalledWith('fonts/manrope-latin-ext-wght-normal.woff2');
  });
});
