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
      connector: { ...settings.style.connector, ...patch.style?.connector },
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
  await clickAll('[data-color-field]');
  await clickAll('button[aria-label="content.callout.boldTitle"]');
  await clickAll('button[aria-label="content.callout.italicTitle"]');
  await clickAll('button[aria-label="content.callout.underlineTitle"]');
  await clickAll('button[aria-label="content.callout.alignCenter"]');
  await clickAll('button[aria-label="content.callout.alignRight"]');
  await clickAll('button[aria-label="content.callout.alignJustify"]');
  expect(latestSettings.style.typography.textAlign).toBe('justify');
  await changeAllNumbers();
  await clickAll('button[aria-label="content.callout.titleToggle"]');
  expect(latestSettings.style.title.enabled).toBe(false);

  await openSection('content.callout.manualSize');
  await changeAllNumbers();

  await openSection('content.callout.manualBackground');
  await clickAll('[data-color-field]');
  await changeAllNumbers();

  await openSection('content.callout.manualConnector');
  await clickAll('[data-color-field]');
  await changeAllNumbers();
  const elbow = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'content.callout.routing.elbow'
  );
  await act(async () => elbow?.click());
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

  expect(latestSettings.style.surface.backgroundColor).toBe('#123456');
  expect(latestSettings.style.connector.kind).toBe('none');
});

it('keeps compact font sliders while accepting a larger manual title size', async () => {
  const bodyRange = document.querySelector<HTMLInputElement>(
    'input[aria-label="content.callout.fontSizeLabelPrefix range"]'
  );
  const titleRange = document.querySelector<HTMLInputElement>(
    'input[aria-label="content.callout.titleFontSizeLabel range"]'
  );

  expect(bodyRange?.max).toBe('36');
  expect(titleRange?.max).toBe('72');

  await enterNumber('content.callout.fontSizeLabelPrefix', 60);
  await enterNumber('content.callout.titleFontSizeLabel', 120);

  expect(latestSettings.style.typography.fontSize).toBe(60);
  expect(latestSettings.style.title.fontSize).toBe(120);
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
