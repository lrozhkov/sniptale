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

import {
  createContentEntrypointStyles,
  normalizeContentEntrypointRemUnits,
  resolveContentEntrypointStyleUrls,
} from './styles';

const STYLES_SOURCE_PATH = fileURLToPath(new URL('./styles.ts', import.meta.url));
const HOST_STYLES_PATH = fileURLToPath(new URL('./host.css', import.meta.url));
const FRAME_SETTINGS_STYLES_PATH = fileURLToPath(
  new URL('../../selection/frame-settings-popover/styles.css', import.meta.url)
);
const CALLOUT_SETTINGS_STYLES_PATH = fileURLToPath(
  new URL('../../selection/callout-settings-popover/styles.css', import.meta.url)
);

afterEach(() => {
  runtimeInfoGetUrlMock.mockClear();
});

describe('content entrypoint styles', () => {
  it('loads the shared style bundle once for the shadow runtime', () => {
    const styles = createContentEntrypointStyles();
    const source = readFileSync(STYLES_SOURCE_PATH, 'utf8');
    const hostStyles = readFileSync(HOST_STYLES_PATH, 'utf8');
    const frameSettingsStyles = readFileSync(FRAME_SETTINGS_STYLES_PATH, 'utf8');
    const calloutSettingsStyles = readFileSync(CALLOUT_SETTINGS_STYLES_PATH, 'utf8');

    expect(styles).toBeTypeOf('string');
    expect(hostStyles).toContain(':host {');
    expect(frameSettingsStyles).toContain('.sniptale-frame-style-preset-row');
    expect(calloutSettingsStyles).toContain('.sniptale-callout-preset-row');
    expect(calloutSettingsStyles).toContain('.sniptale-callout-preset-list {\n  gap: 10px;');
    expect(calloutSettingsStyles).toContain("[data-callout-settings-mode-switch='true']");
    expect(calloutSettingsStyles).toContain(
      "[data-callout-settings-mode-switch='true'] > button > span {\n  line-height: 16px;"
    );
    expect(calloutSettingsStyles).toContain('box-shadow: inset 2px 0 0');
    expect(calloutSettingsStyles).toContain('cursor: inherit !important;');
    expect(calloutSettingsStyles).toContain('min-height: 28px;');
    expect(source).toContain('./host.css?inline');
    expect(source).toContain('frame-settings-popover/styles.css?inline');
    expect(source).toContain('callout-settings-popover/styles.css?inline');
    expect(source).toContain('@sniptale/ui/styles?inline');
    expect(source).not.toContain('@sniptale/ui/styles/tailwind?inline');
    expect(source).not.toContain('../../../shared/design-tokens.css?inline');
  });

  it('keeps shadow UI dimensions independent from the host page root font size', () => {
    expect(
      normalizeContentEntrypointRemUnits(
        [
          '.h-8 { height: 2rem; } .p-3 { padding: .75rem; }',
          '.w-\\[15rem\\] { width: 15rem; }',
          '@media (min-width: 48rem) { .offset { left: -.5rem; } }',
          '.literal::after { content: "1rem"; } /* keep 2rem */',
        ].join(' ')
      )
    ).toBe(
      [
        '.h-8 { height: 32px; } .p-3 { padding: 12px; }',
        '.w-\\[15rem\\] { width: 240px; }',
        '@media (min-width: 768px) { .offset { left: -8px; } }',
        '.literal::after { content: "1rem"; } /* keep 2rem */',
      ].join(' ')
    );
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
