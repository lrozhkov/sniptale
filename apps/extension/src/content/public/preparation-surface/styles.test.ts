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
const SETTINGS_POPOVER_STYLES_PATH = fileURLToPath(
  new URL('../../selection/popover-sync/styles.css', import.meta.url)
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
    const settingsPopoverStyles = readFileSync(SETTINGS_POPOVER_STYLES_PATH, 'utf8');

    expect(styles).toBeTypeOf('string');
    expect(hostStyles).toContain(':host {');
    expect(frameSettingsStyles).toContain('.sniptale-frame-style-preset-row');
    expect(calloutSettingsStyles).toContain('.sniptale-callout-preset-row');
    expect(calloutSettingsStyles).toContain('.sniptale-step-badge-popover {');
    expect(calloutSettingsStyles).toContain('--sniptale-preset-list-max-height: min(296px');
    expect(calloutSettingsStyles).toContain('.sniptale-callout-preset-list {\n  gap: 8px;');
    expect(calloutSettingsStyles).toContain('padding: 0;');
    expect(calloutSettingsStyles).toContain('scroll-padding-block: 4px;');
    expect(calloutSettingsStyles).toContain('flex: 0 0 auto;');
    expect(calloutSettingsStyles).not.toContain('data-callout-settings-mode-switch');
    expect(calloutSettingsStyles).toContain(
      '.sniptale-callout-preset-row .sniptale-glass-preset-item--active {'
    );
    expect(calloutSettingsStyles).toContain('background: transparent;');
    expect(calloutSettingsStyles).toContain('box-shadow: none;');
    expect(calloutSettingsStyles).toContain('cursor: inherit !important;');
    expect(settingsPopoverStyles).toContain('.sniptale-settings-popover-header');
    expect(settingsPopoverStyles).toContain('.sniptale-settings-popover-mode-action');
    expect(settingsPopoverStyles).toContain('min-height: 22px;');
    expect(settingsPopoverStyles).toContain(
      '.sniptale-content-popover--compact .sniptale-settings-popover-header {'
    );
    expect(settingsPopoverStyles).toContain('align-items: center;');
    expect(settingsPopoverStyles).toContain('padding-bottom: 4px;');
    expect(settingsPopoverStyles).not.toMatch(
      /\.sniptale-settings-popover-header \.sniptale-toolbar-menu-title\s*\{[^}]*font-size:/s
    );
    expect(source).toContain('./host.css?inline');
    expect(source).toContain('frame-settings-popover/styles.css?inline');
    expect(source).toContain('callout-settings-popover/styles.css?inline');
    expect(source).toContain('popover-sync/styles.css?inline');
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
