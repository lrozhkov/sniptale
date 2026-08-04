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
  CompactColorSelector: (props: { label: string; onChange: (value: string) => void }) => (
    <button data-color-field={props.label} onClick={() => props.onChange('#123456')}>
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
    style: {
      accentEdge: { ...settings.style.accentEdge, ...patch.style?.accentEdge },
      colorBindings: { ...settings.style.colorBindings, ...patch.style?.colorBindings },
      connector: { ...settings.style.connector, ...patch.style?.connector },
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
  await clickAll('[data-color-field]');
  await changeAllNumbers();
  expect(latestSettings.style.title).toMatchObject({
    backgroundColor: '#123456',
    textColor: '#123456',
  });
  await clickAll('button[aria-label="content.callout.titleToggle"]');
  expect(latestSettings.style.title.enabled).toBe(false);
  expect(document.querySelector('button[aria-label="content.callout.manualDivider"]')).toBeNull();

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
  expect(latestSettings.style.surface.backgroundColor).not.toBe('#fedcba');
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
});
