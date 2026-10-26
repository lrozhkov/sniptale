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

vi.mock('../../../ui/color-selector/picker.css?inline', async () => {
  const { readFileSync } = await import('node:fs');
  return {
    default: readFileSync(
      new URL('../../../ui/color-selector/picker.css', import.meta.url),
      'utf8'
    ),
  };
});

vi.mock('../../../ui/compact-inspector-controls/disclosure.css?inline', async () => {
  const { readFileSync } = await import('node:fs');
  return {
    default: readFileSync(
      new URL('../../../ui/compact-inspector-controls/disclosure.css', import.meta.url),
      'utf8'
    ),
  };
});

import {
  createContentEntrypointStyles,
  normalizeContentEntrypointRemUnits,
  resolveContentEntrypointStyleUrls,
} from './styles';

const STYLES_SOURCE_PATH = fileURLToPath(new URL('./styles.ts', import.meta.url));
const HOST_STYLES_PATH = fileURLToPath(new URL('./host.css', import.meta.url));
const EFFECTS_STYLES_PATH = fileURLToPath(new URL('./effects.css', import.meta.url));
const FRAME_SETTINGS_STYLES_PATH = fileURLToPath(
  new URL('../../../composition/frame-annotation-controls/frame/styles.css', import.meta.url)
);
const CALLOUT_SETTINGS_STYLES_PATH = fileURLToPath(
  new URL('../../../composition/frame-annotation-controls/callout/styles.css', import.meta.url)
);
const SETTINGS_POPOVER_STYLES_PATH = fileURLToPath(
  new URL('../../../composition/frame-annotation-controls/popover/styles.css', import.meta.url)
);

afterEach(() => {
  runtimeInfoGetUrlMock.mockClear();
});

describe('content entrypoint styles', () => {
  it('includes custom color picker controls in the injected shadow stylesheet', () => {
    const styles = createContentEntrypointStyles();
    expect(styles).toContain('.sniptale-picker-range::-webkit-slider-thumb');
    expect(styles).toContain('.sniptale-color-plane-ring');
    expect(styles).toContain('.sniptale-picker-number');
    expect(styles).toContain('.sniptale-picker-steppers');
    expect(styles).toContain('.sniptale-picker-checker');
  });

  it('loads the shared style bundle once for the shadow runtime', () => {
    const styles = createContentEntrypointStyles();
    const source = readFileSync(STYLES_SOURCE_PATH, 'utf8');
    const hostStyles = readFileSync(HOST_STYLES_PATH, 'utf8');
    const effectsStyles = readFileSync(EFFECTS_STYLES_PATH, 'utf8');
    const frameSettingsStyles = readFileSync(FRAME_SETTINGS_STYLES_PATH, 'utf8');
    const calloutSettingsStyles = readFileSync(CALLOUT_SETTINGS_STYLES_PATH, 'utf8');
    const settingsPopoverStyles = readFileSync(SETTINGS_POPOVER_STYLES_PATH, 'utf8');

    expect(styles).toBeTypeOf('string');
    expect(hostStyles).toContain(':host {');
    expect(hostStyles).toContain('--sniptale-content-ui-scale: 1;');
    expect(effectsStyles).toContain('scale: var(--sniptale-content-ui-scale);');
    expect(effectsStyles).toContain(
      '.sniptale-content-ui-zoom-surface {\n  zoom: var(--sniptale-content-ui-scale);'
    );
    expect(effectsStyles).not.toContain(
      '.sniptale-toolbar,\n.sniptale-collapsed-panels,\n.sniptale-toolbar-portal-wrapper'
    );
    expect(effectsStyles).toContain('.sniptale-resize-handle');
    expect(effectsStyles).toContain('.sniptale-toolbar-portal-wrapper');
    expect(effectsStyles).toContain('.sniptale-content-ui-positioner');
    expect(effectsStyles).not.toMatch(
      /\.sniptale-frame-toolbar-bridge,[\s\S]*?scale: var\(--sniptale-content-ui-scale\)/
    );
    expect(effectsStyles).toContain('scrollbar-width: thin;');
    expect(effectsStyles).toContain('::-webkit-scrollbar');
    expect(effectsStyles).not.toContain('.sniptale-drawing-canvas:focus-visible');
    expect(frameSettingsStyles).toContain('.sniptale-frame-style-preset-row');
    expect(calloutSettingsStyles).toContain('.sniptale-callout-preset-row');
    expect(calloutSettingsStyles).toContain('.sniptale-step-badge-popover {');
    expect(calloutSettingsStyles).toContain('--sniptale-preset-list-max-height: min(296px');
    expect(calloutSettingsStyles).toContain('.sniptale-callout-preset-list {\n  gap: 6px;');
    expect(calloutSettingsStyles).toContain('padding: 0;');
    expect(calloutSettingsStyles).toContain('scroll-padding-block: 4px;');
    expect(calloutSettingsStyles).toContain('flex: 0 0 auto;');
    expect(calloutSettingsStyles).not.toContain('data-callout-settings-mode-switch');
    expect(calloutSettingsStyles).toContain(
      '.sniptale-callout-preset-row:hover .sniptale-glass-preset-check,'
    );
    expect(calloutSettingsStyles).not.toContain(
      '.sniptale-callout-preset-row .sniptale-glass-preset-item--active {'
    );
    expect(calloutSettingsStyles).toContain('cursor: inherit !important;');
    expect(settingsPopoverStyles).toContain('.sniptale-settings-popover-header');
    expect(settingsPopoverStyles).toContain('.sniptale-settings-popover-icon-action');
    expect(settingsPopoverStyles).toContain('.sniptale-settings-popover-source-switch');
    expect(settingsPopoverStyles).toContain('min-height: 24px;');
    expect(settingsPopoverStyles).toContain('align-items: center;');
    expect(settingsPopoverStyles).toContain('padding-bottom: 4px;');
    expect(settingsPopoverStyles).not.toMatch(
      /\.sniptale-settings-popover-header \.sniptale-toolbar-menu-title\s*\{[^}]*font-size:/s
    );
    expect(source).toContain('./host.css?inline');
    expect(source).toContain('frame-annotation-controls/frame/styles.css?inline');
    expect(source).toContain('frame-annotation-controls/callout/styles.css?inline');
    expect(source).toContain('frame-annotation-controls/popover/styles.css?inline');
    expect(source).toContain('frame-annotation/interaction/styles.css?inline');
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

  it.each([
    [
      '.x { content: "a:b;{1rem}"; width: calc(1rem + var(--x, 2rem)); }',
      '.x { content: "a:b;{1rem}"; width: calc(16px + var(--x, 32px)); }',
    ],
    ['.x[data-label=":;{1rem}"] { margin: 1rem; }', '.x[data-label=":;{1rem}"] { margin: 16px; }'],
    [
      String.raw`.x { escaped\:name: 1rem; --literal: a\;b; }`,
      String.raw`.x { escaped\:name: 16px; --literal: a\;b; }`,
    ],
    [
      '/* :;{ 2rem */ .x { width: 1rem; /* :;{ 3rem */ }',
      '/* :;{ 2rem */ .x { width: 16px; /* :;{ 3rem */ }',
    ],
    [
      String.raw`.x { content: "a\";1rem"; width: 2rem; }`,
      String.raw`.x { content: "a\";1rem"; width: 32px; }`,
    ],
    [
      '@media (min-width: 10rem) { .x { width: 1rem; } }',
      '@media (min-width: 160px) { .x { width: 16px; } }',
    ],
    ['.x { content: "1rem; width: 2rem; }', '.x { content: "1rem; width: 2rem; }'],
    ['.x { width: 1rem; /* 2rem', '.x { width: 16px; /* 2rem'],
    [
      '.x { width: calc(1rem + 2rem; padding: 3rem; }',
      '.x { width: calc(16px + 32px; padding: 48px; }',
    ],
  ])('preserves CSS lexical boundaries while normalizing %s', (input, expected) => {
    expect(normalizeContentEntrypointRemUnits(input)).toBe(expected);
  });

  it('resolves callout font URLs through extension runtime URLs', () => {
    const styles = resolveContentEntrypointStyleUrls(
      "src: url('@fontsource/marck-script/files/marck-script-cyrillic-400-normal.woff2') format('woff2');"
    );
    expect(styles).toContain(
      'url("chrome-extension://sniptale/fonts/marck-script-cyrillic-400-normal.woff2")'
    );
    expect(runtimeInfoGetUrlMock).toHaveBeenCalledWith(
      'fonts/marck-script-cyrillic-400-normal.woff2'
    );
  });
});

it('registers locally scoped property focus styles in the content bundle', () => {
  const source = readFileSync(STYLES_SOURCE_PATH, 'utf8');
  const styles = readFileSync(
    new URL('../../overlay/design-review/settings/styles.css', import.meta.url),
    'utf8'
  );
  expect(source).toContain(
    "import designReviewSettingsStyles from '../../overlay/design-review/settings/styles.css?inline'"
  );
  expect(source).toContain('        designReviewSettingsStyles,');
  expect(styles).toContain(
    "[data-ui='content.design-review.settings'][data-focus-modality='pointer']"
  );
  expect(styles).toContain(
    "[data-ui='content.design-review.settings'][data-focus-modality='keyboard']"
  );
});

it.each(['ui', 'text'])('maps bundled Golos %s VF from supported source forms', (role) => {
  const file = `golos-${role}-vf.woff2`;
  for (const prefix of [`/packages/ui/src/styles/golos-${role}/`, `./golos-${role}/`, './']) {
    expect(resolveContentEntrypointStyleUrls(`src: url("${prefix}${file}")`)).toBe(
      `src: url("chrome-extension://sniptale/assets/${file}")`
    );
  }
  expect(readFileSync(STYLES_SOURCE_PATH, 'utf8')).toContain(
    'compact-inspector-controls/inspector-surface.css?inline'
  );
});

it('leaves unrelated font sources outside the exact bundled Golos UI inventory unchanged', () => {
  for (const source of [
    './golos-ui/golos-ui-semibold.woff2',
    './golos-ui/golos-text-regular.woff2',
    'https://example.test/golos-ui-vf.woff2',
    '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  ]) {
    const declaration = `src: url("${source}")`;
    expect(resolveContentEntrypointStyleUrls(declaration)).toBe(declaration);
  }
  expect(runtimeInfoGetUrlMock).not.toHaveBeenCalled();
});

it('keeps an unresolved Interface declaration when runtime URL resolution is unavailable', () => {
  runtimeInfoGetUrlMock.mockImplementationOnce(() => {
    throw new Error('runtime unavailable');
  });
  const source = 'url("./golos-ui/golos-ui-vf.woff2")';
  expect(resolveContentEntrypointStyleUrls(source)).toBe(source);
});

it('does not resolve removed Manrope resources', () => {
  const source = 'url("./manrope-latin-wght-normal.woff2")';
  expect(resolveContentEntrypointStyleUrls(source)).toBe(source);
  expect(runtimeInfoGetUrlMock).not.toHaveBeenCalled();
});

it('isolates host-page text stroke at the content shadow boundary', () => {
  const styles = readFileSync(HOST_STYLES_PATH, 'utf8');
  expect(styles).toContain('-webkit-text-stroke: 0 !important;');
});

it('keeps embedded settings header commands neutral and aligned', () => {
  const styles = readFileSync(SETTINGS_POPOVER_STYLES_PATH, 'utf8');
  const selector = '.sniptale-settings-popover-header .sniptale-settings-popover-icon-action {';
  const block = styles.slice(styles.indexOf(selector)).split('}')[0];
  expect(block).toContain('background: transparent');
  expect(block).toContain('border: 0');
  expect(block).toContain('width: 28px');
  expect(block).toContain('align-items: center');
  const header = styles.split('}')[0];
  expect(header).toContain('min-height: 32px');
  expect(header).toContain('align-items: center');
});

it('includes the shared disclosure geometry in isolated content UI styles', () => {
  const styles = createContentEntrypointStyles();
  expect(styles).toContain('.sniptale-disclosure > summary');
  expect(styles).toContain('.sniptale-disclosure > summary::-webkit-details-marker');
});
