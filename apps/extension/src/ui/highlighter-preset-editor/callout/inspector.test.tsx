// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  CalloutSettings,
  CalloutSettingsPatch,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';
import { CalloutManualSettings } from './inspector';
import { CalloutConnectorSettings } from './inspector-effects';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../color-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../color-selector')>()),
  CompactColorSelector: (props: {
    disabled?: boolean;
    label: string;
    onChange: (value: string) => void;
  }) => (
    <button
      disabled={props.disabled}
      data-color-field={props.label}
      onClick={() => props.onChange('#123456')}
    >
      {props.label}
    </button>
  ),
}));

let container: HTMLDivElement;
let root: Root;
let latestSettings: CalloutSettings;

function applyPatch(settings: CalloutSettings, patch: CalloutSettingsPatch): CalloutSettings {
  return {
    ...settings,
    content: { ...settings.content, ...patch.content },
    placement: {
      ...settings.placement,
      ...patch.placement,
      connectorAttachments:
        patch.placement?.connectorAttachments ?? settings.placement.connectorAttachments,
    },
    style: {
      accentEdge: { ...settings.style.accentEdge, ...patch.style?.accentEdge },
      badge: { ...settings.style.badge, ...patch.style?.badge },
      colorBindings: { ...settings.style.colorBindings, ...patch.style?.colorBindings },
      connector: {
        ...settings.style.connector,
        ...patch.style?.connector,
        cornerStyle: {
          ...settings.style.connector.cornerStyle,
          ...patch.style?.connector?.cornerStyle,
        },
        curve: { ...settings.style.connector.curve, ...patch.style?.connector?.curve },
        spacing: { ...settings.style.connector.spacing, ...patch.style?.connector?.spacing },
      },
      customCss: patch.style?.customCss ?? settings.style.customCss,
      surface: { ...settings.style.surface, ...patch.style?.surface },
      title: { ...settings.style.title, ...patch.style?.title },
      typography: { ...settings.style.typography, ...patch.style?.typography },
    },
  };
}

function Harness() {
  const preset = createSystemCalloutPresetCatalog()[4]!;
  const [settings, setSettings] = useState<CalloutSettings>({
    content: { bodyHtml: '', titleText: '' },
    enabled: true,
    placement: preset.placement,
    style: preset.style,
  });
  latestSettings = settings;
  return (
    <CalloutManualSettings
      frameColors={{ borderColor: '#abcdef', fillColor: '#fedcba' }}
      settings={settings}
      onChange={(patch) => setSettings((current) => applyPatch(current, patch))}
    />
  );
}

async function openSection(label: string) {
  await act(async () =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click()
  );
}

async function clickAll(selector: string) {
  for (const element of document.querySelectorAll<HTMLButtonElement>(selector)) {
    await act(async () => element.click());
  }
}

async function clickText(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === text
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  await act(async () => button.click());
}

async function changeAllNumbers() {
  for (const input of document.querySelectorAll<HTMLInputElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-value-field"] input'
  )) {
    await act(async () => {
      input.value = String(Number(input.value || 0) + 1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}

async function enterNumber(label: string, value: number) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`Numeric input not found: ${label}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    input.focus();
    setter?.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });
}

async function selectOption(label: string, optionLabel: string) {
  await act(async () =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click()
  );
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (element) => element.textContent === optionLabel
  );
  await act(async () => option?.click());
}

async function enterCss(value: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    'textarea[aria-describedby="sniptale-callout-custom-css-help"]'
  );
  if (!textarea) throw new Error('Callout CSS editor not found');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('edits every shared callout inspector section and connector mode', async () => {
  expect(
    document.querySelector('[data-color-field="content.callout.textColorLabel"]')
  ).not.toBeNull();
  expect(document.querySelector('[data-ui="shared.callout-emphasis"]')).not.toBeNull();
  expect(document.querySelector('[data-ui="shared.callout-alignment"]')).not.toBeNull();
  await selectOption('content.callout.fontFamilyLabel', 'content.callout.font.cursive');
  expect(latestSettings.style.typography.fontFamily).toBe('cursive');
  await clickAll('[data-color-field]');
  await clickAll('button[aria-label="content.callout.boldTitle"]');
  await clickAll('button[aria-label="content.callout.italicTitle"]');
  await clickAll('button[aria-label="content.callout.underlineTitle"]');
  await clickAll('button[aria-label="content.callout.alignCenter"]');
  await clickAll('button[aria-label="content.callout.alignRight"]');
  await clickAll('button[aria-label="content.callout.alignJustify"]');
  expect(latestSettings.style.typography.textAlign).toBe('justify');
  await changeAllNumbers();

  await openSection('content.callout.manualDivider');
  await clickAll('[data-color-field]');
  await selectOption('content.callout.lineStyleLabel', 'content.callout.lineStyle.dotted');
  await enterNumber('content.callout.dividerWidthLabel', 3);
  expect(latestSettings.style.title).toMatchObject({
    dividerColor: '#123456',
    dividerStyle: 'dotted',
    dividerWidth: 3,
  });

  await openSection('content.callout.manualTitle');
  const titleInput = document.querySelector<HTMLInputElement>(
    'input[placeholder="content.callout.titleTextPlaceholder"]'
  );
  expect(titleInput?.type).toBe('text');
  expect(titleInput?.className).toContain('cursor-text');
  const titleValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set;
  await act(async () => {
    if (!titleInput) return;
    titleValueSetter?.call(titleInput, 'Saved heading');
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await clickAll('[data-color-field]');
  await changeAllNumbers();
  expect(latestSettings.style.title).toMatchObject({
    backgroundColor: '#123456',
    textColor: '#123456',
  });
  expect(latestSettings.content.titleText).toBe('Saved heading');
  await clickAll('button[aria-label="content.callout.titleToggle"]');
  expect(latestSettings.style.title.enabled).toBe(false);
  expect(document.querySelector('button[aria-label="content.callout.manualDivider"]')).toBeNull();
  expect(document.querySelector('button[aria-label="content.callout.manualBadge"]')).not.toBeNull();

  await openSection('content.callout.manualBadge');
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('button[aria-label="content.callout.badgeEnabled"]')
      ?.click()
  );
  expect(latestSettings.style.badge).toMatchObject({ enabled: true, placement: 'body-start' });
  expect(
    document.querySelectorAll(
      '[role="option"][data-value="title-start"], [role="option"][data-value="title-end"]'
    )
  ).toHaveLength(0);
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('button[aria-label="content.callout.badgeEnabled"]')
      ?.click()
  );

  await openSection('content.callout.manualSize');
  await changeAllNumbers();

  await openSection('content.callout.manualBackground');
  await clickAll('[data-color-field]');
  await changeAllNumbers();

  await openSection('content.callout.manualConnector');
  await clickAll('[data-color-field]');
  await changeAllNumbers();
  await selectOption('content.callout.routingLabel', 'content.callout.routing.polyline');
  expect(latestSettings.style.connector.routing).toBe('polyline');
  await selectOption('content.callout.routingLabel', 'content.callout.routing.elbow');
  expect(latestSettings.style.connector.routing).toBe('elbow');
  await clickAll('button[aria-label="content.callout.blockMarker"]');
  await clickAll('[role="option"]');
  await clickAll('button[aria-label="content.callout.frameMarker"]');
  await clickAll('[role="option"]');
  const wedge = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'content.callout.connector.wedge'
  );
  await act(async () => wedge?.click());
  await changeAllNumbers();
  const line = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'content.callout.connector.line'
  );
  await act(async () => line?.click());
  const none = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'content.callout.connector.none'
  );
  await act(async () => none?.click());

  await openSection('content.callout.manualBorder');
  await clickAll('[data-color-field]');
  await changeAllNumbers();

  await openSection('content.callout.manualCss');
  await enterCss('[title]\ntext-transform: uppercase;');
  expect(latestSettings.style.customCss).toBe('[title]\ntext-transform: uppercase;');
  await enterCss('[card]\nposition: fixed;');
  expect(latestSettings.style.customCss).toBe('[title]\ntext-transform: uppercase;');
  expect(document.querySelector('textarea')?.getAttribute('aria-invalid')).toBe('true');

  expect(latestSettings.style.surface.backgroundColor).toBe('#123456');
  expect(latestSettings.style.connector.kind).toBe('none');
});

it('keeps compact font sliders while accepting a larger manual title size', async () => {
  const bodyRange = document.querySelector<HTMLInputElement>(
    'input[aria-label="content.callout.fontSizeLabelPrefix range"]'
  );
  expect(bodyRange?.max).toBe('36');
  await enterNumber('content.callout.fontSizeLabelPrefix', 60);

  await openSection('content.callout.manualTitle');
  const titleRange = document.querySelector<HTMLInputElement>(
    'input[aria-label="content.callout.titleFontSizeLabel range"]'
  );

  expect(titleRange?.max).toBe('72');

  await enterNumber('content.callout.titleFontSizeLabel', 120);

  expect(latestSettings.style.typography.fontSize).toBe(60);
  expect(latestSettings.style.title.fontSize).toBe(120);
});

it('stores a semantic frame color source and disables the custom picker', async () => {
  await openSection('content.callout.manualBackground');
  const sourceToggle = document.querySelector<HTMLButtonElement>('[data-color-source="custom"]');
  await act(async () => sourceToggle?.click());
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[data-color-source="frame-border"]')?.click()
  );

  expect(latestSettings.style.colorBindings.surfaceBackground).toBe('frame-fill');
  const backgroundPicker = document.querySelector<HTMLButtonElement>(
    '[data-color-field="content.callout.backgroundLabel"]'
  );
  expect(backgroundPicker?.closest('fieldset')?.disabled).toBe(true);
  expect(backgroundPicker?.disabled).toBe(true);
  expect(latestSettings.style.surface.backgroundColor).not.toBe('#fedcba');
});

it('inherits the shadow color from the resolved comment background and border', async () => {
  await openSection('content.callout.manualBackground');
  const customSource = document.querySelector<HTMLButtonElement>(
    '[data-shadow-color-source="custom"]'
  );
  await act(async () => customSource?.click());
  expect(latestSettings.style.colorBindings.shadow).toBe('surface-background');
  expect(
    document
      .querySelector('[data-color-field="content.callout.shadowColorLabel"]')
      ?.closest('fieldset')?.disabled
  ).toBe(true);

  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[data-shadow-color-source="surface-background"]')
      ?.click()
  );
  expect(latestSettings.style.colorBindings.shadow).toBe('surface-border');
});

it('edits advanced connector routing and rounded corners without attachment mode controls', async () => {
  await openSection('content.callout.manualConnector');
  await selectOption('content.callout.routingLabel', 'content.callout.routing.curve');
  await enterNumber('content.callout.curvatureLabel', 0.8);
  expect(latestSettings.style.connector).toMatchObject({
    curve: { curvature: 0.8 },
    routing: 'curve',
  });

  latestSettings.style.connector.curve.mode = 'manual';
  latestSettings.style.connector.curve.startHandle = { x: 10, y: 20 };
  await act(async () => root.render(<Harness />));
  await clickText('content.callout.resetRoute');
  expect(latestSettings.style.connector.curve).toMatchObject({ mode: 'auto' });

  expect(document.body.textContent).not.toContain('content.callout.frameAttachmentLabel');
  expect(document.body.textContent).not.toContain('content.callout.blockAttachmentLabel');
  expect(document.body.textContent).not.toContain('content.callout.attachmentMode.anchor');

  await selectOption('content.callout.routingLabel', 'content.callout.routing.elbow');
  await clickText('content.callout.cornerStyle.rounded');
  await enterNumber('content.callout.cornerRadiusLabel', 18);
  await enterNumber('content.callout.frameGapLabel', 9);
  await enterNumber('content.callout.blockGapLabel', 7);
  expect(latestSettings.style.connector).toMatchObject({
    cornerStyle: { kind: 'rounded', radius: 18 },
    spacing: { blockGap: 7, frameGap: 9 },
  });
});

it('keeps advanced body, title, and badge typography independently editable', async () => {
  await selectOption('content.callout.directionLabel', 'content.callout.direction.rtl');
  await selectOption('content.callout.wordBreakLabel', 'content.callout.wordBreak.break-word');
  await selectOption('content.callout.hyphensLabel', 'content.callout.hyphens.auto');
  await enterNumber('content.callout.lineHeightLabel', 1.8);
  expect(latestSettings.style.typography).toMatchObject({
    direction: 'rtl',
    hyphens: 'auto',
    lineHeight: 1.8,
    wordBreak: 'break-word',
  });

  await openSection('content.callout.manualTitle');
  await selectOption('content.callout.directionLabel', 'content.callout.direction.ltr');
  expect(document.querySelector('button[aria-label="content.callout.manualBadge"]')).not.toBeNull();
  await openSection('content.callout.manualBadge');
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('button[aria-label="content.callout.badgeEnabled"]')
      ?.click()
  );
  expect(latestSettings.style.title.direction).toBe('ltr');
  expect(latestSettings.style.badge.enabled).toBe(true);
  expect(
    document.querySelector<HTMLInputElement>(
      'input[placeholder="content.callout.badgeTextPlaceholder"]'
    )?.className
  ).toContain('cursor-text');
  expect(
    document.querySelector<HTMLInputElement>(
      'input[placeholder="content.callout.badgeTextPlaceholder"]'
    )?.type
  ).toBe('text');
  await selectOption(
    'content.callout.badgePlacementLabel',
    'content.callout.badgePlacement.body-start'
  );
  await selectOption('content.callout.badgeShapeLabel', 'content.callout.badgeShape.circle');
  await selectOption('content.callout.badgeFontWeight', 'content.callout.badgeFontWeightNormal');
  expect(document.querySelectorAll('[data-badge-color-source]')).toHaveLength(2);
  expect(
    document.querySelectorAll('[data-color-field="content.callout.badgeBackgroundColor"]')
  ).toHaveLength(1);
  expect(
    document.querySelectorAll('[data-color-field="content.callout.badgeTextColor"]')
  ).toHaveLength(1);
  expect(latestSettings.style.badge).toMatchObject({
    fontWeight: 'normal',
    placement: 'body-start',
    shape: 'circle',
  });
});

it('uses plain aligned numeric and select controls in callout settings', () => {
  const numericRow = document.querySelector<HTMLElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-row"]'
  );
  const select = document.querySelector<HTMLButtonElement>(
    '[data-ui="shared.ui.compact-select"] > button'
  );

  expect(numericRow?.dataset['appearance']).toBe('plain');
  expect(numericRow?.className).not.toContain('surface-input');
  expect(select?.className).toContain('border-transparent bg-transparent');
  expect(select?.title).toBe('');
});

it('configures a one-sided accent edge in its own inspector section', async () => {
  await openSection('content.callout.manualAccent');
  await clickAll('button[aria-label="content.callout.accentEnabled"]');
  const bottom = document.querySelector<HTMLButtonElement>('[data-accent-side="bottom"]');
  await act(async () => bottom?.click());
  await selectOption('content.callout.lineStyleLabel', 'content.callout.lineStyle.dotted');
  await enterNumber('content.callout.accentWidthLabel', 6);

  expect(latestSettings.style.accentEdge).toMatchObject({
    enabled: true,
    lineStyle: 'dotted',
    side: 'bottom',
    width: 6,
  });
});

it('places accent edge immediately after the badge section', () => {
  const labels = [...document.querySelectorAll<HTMLButtonElement>('nav button')].map((button) =>
    button.getAttribute('aria-label')
  );
  const badgeIndex = labels.indexOf('content.callout.manualBadge');

  expect(badgeIndex).toBeGreaterThanOrEqual(0);
  expect(labels[badgeIndex + 1]).toBe('content.callout.manualAccent');
});

it('keeps the default-width slider bounded without capping manual input', async () => {
  await openSection('content.callout.manualSize');
  const widthRange = document.querySelector<HTMLInputElement>(
    'input[aria-label="content.callout.defaultWidthLabel range"]'
  );
  const widthInput = document.querySelector<HTMLInputElement>(
    'input[aria-label="content.callout.defaultWidthLabel"]'
  );

  expect(widthRange?.min).toBe('100');
  expect(widthRange?.max).toBe('800');
  expect(widthInput?.max).toBe('');

  await enterNumber('content.callout.defaultWidthLabel', 1400);

  expect(latestSettings.style.typography.maxWidth).toBe(1400);
  expect(widthRange?.max).toBe('800');
});

it('shows an endpoint size only when that endpoint has a marker', () => {
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const withoutMarkers = renderToStaticMarkup(
    <CalloutConnectorSettings
      onChange={vi.fn()}
      settings={{
        content: { bodyHtml: '', titleText: '' },
        enabled: true,
        placement: preset.placement,
        style: {
          ...preset.style,
          connector: {
            ...preset.style.connector,
            kind: 'line',
            blockMarker: 'none',
            frameMarker: 'none',
          },
        },
      }}
    />
  );
  const withMarkers = renderToStaticMarkup(
    <CalloutConnectorSettings
      onChange={vi.fn()}
      settings={{
        content: { bodyHtml: '', titleText: '' },
        enabled: true,
        placement: preset.placement,
        style: {
          ...preset.style,
          connector: {
            ...preset.style.connector,
            kind: 'line',
            blockMarker: 'arrow',
            frameMarker: 'circle',
          },
        },
      }}
    />
  );

  expect(withoutMarkers).not.toContain('content.callout.blockMarkerSize');
  expect(withoutMarkers).not.toContain('content.callout.frameMarkerSize');
  expect(withMarkers).toContain('content.callout.blockMarkerSize');
  expect(withMarkers).toContain('content.callout.frameMarkerSize');
  expect(withMarkers.indexOf('content.callout.blockMarker')).toBeLessThan(
    withMarkers.indexOf('content.callout.additionalSettings')
  );
  expect(withMarkers.indexOf('content.callout.frameMarker')).toBeLessThan(
    withMarkers.indexOf('content.callout.additionalSettings')
  );
  expect(withMarkers).not.toContain('content.callout.frameAttachmentLabel');
  expect(withMarkers).not.toContain('content.callout.blockAttachmentLabel');
});
