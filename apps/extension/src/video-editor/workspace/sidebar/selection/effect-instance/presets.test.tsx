// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import type { EffectBundleCatalogEntry } from '../../../../../features/video/project/effect-bundle/catalog';
import type { EffectPresetPreferences } from '../../../../../features/video/project/effect-bundle/catalog/presets';
import { EffectVisualPresets } from './presets';
const mocks = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn() }));
vi.mock('../../../../../composition/persistence/effect-bundles', async (original) => ({
  ...(await original<typeof import('../../../../../composition/persistence/effect-bundles')>()),
  listEffectBundles: mocks.list,
}));
vi.mock('../../../../../composition/persistence/effect-bundles/presets', async (original) => ({
  ...(await original<
    typeof import('../../../../../composition/persistence/effect-bundles/presets')
  >()),
  saveEffectPresetPreferences: mocks.save,
}));
vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../shared/controls', async (original) => ({
  ...(await original<typeof import('../shared/controls')>()),
  SelectInput: ({
    label,
    value,
    options,
    disabled,
    onChange,
  }: {
    label: string;
    value: string;
    options: Array<{ value: string; label: string; disabled?: boolean }>;
    disabled?: boolean;
    onChange(value: string): void;
  }) => (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
const source = readFileSync(
  'packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-callout.sniptale-effect.json',
  'utf8'
);
const doc = parseEffectV1Source(source).document!;
const catalog: EffectBundleCatalogEntry = {
  packId: 'raw.callout',
  documents: [
    {
      id: doc.id,
      kind: 'standalone',
      source,
      sha256: 'a'.repeat(64),
      schemaVersion: 'sniptale.effect.v1',
      assets: [],
    },
  ],
  assets: [],
  enabled: true,
  label: { en: 'Callout', ru: 'Выноска' },
  description: { en: '', ru: '' },
  source: 'raw-json',
  sourceSha256: 'a'.repeat(64),
  retainedByteLength: source.length,
  createdAt: 0,
  updatedAt: 0,
  version: '1',
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  mocks.list.mockResolvedValue([{ status: 'ready', entry: catalog }]);
  mocks.save.mockImplementation(
    async (_pack: string, _id: string, _sha: string, preferences: EffectPresetPreferences) => ({
      ...catalog,
      documents: [{ ...catalog.documents[0]!, presetPreferences: preferences }],
    })
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const change = async (element: HTMLInputElement | HTMLSelectElement, value: string) =>
  act(async () => {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })
    );
  });
const button = (key: string) =>
  [...host.querySelectorAll('button')].find((item) => item.textContent === key)!;
it('switches styles, saves and removes presets, chooses defaults and reports persistence failures', async () => {
  let controls = {
    ...Object.fromEntries(doc.controls.map((control) => [control.id, control.defaultValue])),
    title: 'User text',
  };
  const update = vi.fn((next: Record<string, string | number>) => {
    controls = { ...next, title: String(next['title']) };
  });
  const render = () =>
    act(async () =>
      root.render(
        <EffectVisualPresets
          document={doc}
          sourceSha256={'a'.repeat(64)}
          controls={controls}
          disabled={false}
          onChange={update}
        />
      )
    );
  await render();
  const style = () =>
    host.querySelector<HTMLSelectElement>(
      '[aria-label="videoEditor.effectsLibrary.visualPreset"]'
    )!;
  const defaults = () =>
    host.querySelector<HTMLSelectElement>(
      '[aria-label="videoEditor.effectsLibrary.defaultPreset"]'
    )!;
  await change(style(), 'builtin:sniptale-orange-light');
  expect(update.mock.calls[0]![0]['title']).toBe('User text');
  await render();
  expect(style().value).toBe('builtin:sniptale-orange-light');
  await act(async () => button('videoEditor.effectsLibrary.savePreset').click());
  await change(host.querySelector('input')!, 'My style');
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  const prefs = mocks.save.mock.calls[0]![3] as EffectPresetPreferences;
  expect(prefs.presets).toHaveLength(1);
  expect(prefs.presets[0]!.values).not.toHaveProperty('title');
  const id = prefs.presets[0]!.id;
  expect(style().value).toBe(`user:${id}`);
  await change(defaults(), `user:${id}`);
  expect(mocks.save.mock.calls.at(-1)![3].defaultPreset).toEqual({ kind: 'user', id });
  await act(async () => button('common.actions.delete').click());
  expect(mocks.save.mock.calls.at(-1)![3]).toEqual({ presets: [] });
  mocks.save.mockRejectedValueOnce(new Error('quota'));
  await change(defaults(), 'builtin:sniptale-orange-dark');
  expect(host.querySelector('[role=alert]')?.textContent).toBe(
    'videoEditor.effectsLibrary.updateFailed'
  );
  await change(defaults(), 'builtin:sniptale-orange-light');
  expect(host.querySelector('[role=alert]')).toBeNull();
  await change(defaults(), 'template');
  expect(mocks.save.mock.calls.at(-1)![3]).toEqual({ presets: [] });
  await act(async () => button('videoEditor.effectsLibrary.savePreset').click());
  await act(async () => button('common.actions.cancel').click());
  expect(host.querySelector('form')).toBeNull();
});
it('retains snapshot styles but disables library writes when the catalog cannot be loaded', async () => {
  mocks.list.mockRejectedValueOnce(new Error('storage unavailable'));
  await act(async () =>
    root.render(
      <EffectVisualPresets
        document={doc}
        sourceSha256={'a'.repeat(64)}
        controls={{ title: 'Saved' }}
        disabled
        onChange={vi.fn()}
      />
    )
  );
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  expect(button('videoEditor.effectsLibrary.savePreset').disabled).toBe(true);
  expect(host.querySelector('select')!.disabled).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
});
