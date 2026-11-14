// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyEffectCatalogDocument } from '../../../../../features/video/project/effect-instance/apply';
import { act, useState } from 'react';
import { createEffectInstanceGroups } from './groups';
import { EffectPresetEditingProvider } from './editing';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
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
  'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
  'utf8'
);
const accepted = parseAnimationTemplateSource(source);
if (!accepted.ok) throw new Error(JSON.stringify(accepted.diagnostics));
const doc = accepted.template;
const sourceSha256 = createHash('sha256').update(source).digest('hex');
const catalog: EffectBundleCatalogEntry = {
  packId: 'raw.callout',
  documents: [
    {
      id: doc.id,
      kind: 'standalone',
      source,
      sha256: sourceSha256,
      schemaVersion: 'sniptale.animation.v1',
      assets: [],
    },
  ],
  assets: [],
  enabled: true,
  label: { en: 'Callout', ru: 'Выноска' },
  description: { en: '', ru: '' },
  source: 'raw-json',
  sourceSha256,
  retainedByteLength: Buffer.byteLength(source),
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
          sourceSha256={sourceSha256}
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
  await change(style(), `builtin:${doc.controlPresets![0]!.id}`);
  expect(update.mock.calls[0]![0]['title']).toBe('User text');
  await render();
  expect(style().value).toBe(`builtin:${doc.controlPresets![0]!.id}`);
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
  await change(defaults(), `builtin:${doc.controlPresets![1]!.id}`);
  expect(host.querySelector('[role=alert]')?.textContent).toBe(
    'videoEditor.effectsLibrary.updateFailed'
  );
  await change(defaults(), `builtin:${doc.controlPresets![0]!.id}`);
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
        sourceSha256={sourceSha256}
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

it('keeps the committed selection while preview controls cross another preset', async () => {
  const first = doc.controlPresets![0]!;
  const second = doc.controlPresets![1]!;
  const render = (controls: Record<string, string | number>, matchingControls = controls) =>
    act(async () =>
      root.render(
        <EffectVisualPresets
          {...{ matchingControls }}
          document={doc}
          sourceSha256={sourceSha256}
          controls={controls}
          disabled={false}
          onChange={vi.fn()}
        />
      )
    );
  await render(first.values);
  expect(host.querySelector('select')!.value).toBe(`builtin:${first.id}`);
  await render(second.values, first.values);
  expect(host.querySelector('select')!.value).toBe(`builtin:${first.id}`);
  await render(second.values);
  expect(host.querySelector('select')!.value).toBe(`builtin:${second.id}`);
});

it.each(['callout', 'frame', 'arrow'])(
  'retains the preset across separated parameter sections for %s',
  async (fixture) => {
    const parsed = parseAnimationTemplateSource(
      readFileSync(
        fixture === 'callout'
          ? 'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json'
          : `apps/extension/public/video-effects/animations/${fixture}.sniptale-animation.json`,
        'utf8'
      )
    );
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
    const original = parsed.template;
    const control = original.controls.find(
      (item) => item.kind === 'number' && item.min !== undefined && item.max !== undefined
    )!;
    if (control.kind !== 'number') throw new Error('Expected numeric control');
    const first = control.min!;
    const second = control.max!;
    const document = {
      ...original,
      defaultControlPresetId: 'first',
      controlPresets: [
        {
          ...doc.controlPresets![0]!,
          id: 'first',
          label: { en: 'First' },
          values: { [control.id]: first },
        },
        {
          ...doc.controlPresets![1]!,
          id: 'second',
          label: { en: 'Second' },
          values: { [control.id]: second },
        },
      ],
    };
    const source = JSON.stringify(document);
    const validation = parseAnimationTemplateSource(source);
    expect(validation.ok, JSON.stringify(validation.diagnostics)).toBe(true);
    const hash = createHash('sha256').update(source).digest('hex');
    const base = createEmptyVideoProject('Preset test');
    base.version = 52;
    base.duration = 4;
    const target = { kind: 'scene' as const };
    const initial = await applyEffectCatalogDocument({
      project: base,
      documentId: document.id,
      instanceId: 'effect',
      startTime: 0,
      standaloneDuration: 4,
      target,
      catalog: {
        packId: `preset-${fixture}`,
        source: 'raw-json',
        sourceSha256: hash,
        version: '1',
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
        assets: [],
        label: { en: document.label.en, ru: document.label.ru ?? document.label.en },
        description: { en: '', ru: '' },
        retainedByteLength: Buffer.byteLength(source),
        documents: [
          {
            id: document.id,
            kind: 'standalone',
            schemaVersion: 'sniptale.animation.v1',
            source,
            sha256: hash,
            assets: [],
          },
        ],
      },
    });
    function Inspector() {
      const [project, setProject] = useState(initial);
      const groups = createEffectInstanceGroups({
        project,
        target,
        onDeleteEffectInstance: vi.fn(),
        onDuplicateEffectInstance: () => null,
        onMoveEffectInstance: vi.fn(),
        onUpdateEffectInstance: (id, patch) =>
          setProject((current) => ({
            ...current,
            effectInstances: current.effectInstances!.map((instance) => {
              if (instance.id !== id) return instance;
              const controls = { ...instance.controls };
              for (const [key, value] of Object.entries(patch.controls ?? {})) {
                if (value !== undefined) controls[key] = value;
              }
              return { ...instance, controls };
            }),
          })),
      });
      return (
        <>
          {groups.map((group) => (
            <section key={group.id}>{group.content}</section>
          ))}
        </>
      );
    }
    await act(async () =>
      root.render(
        <EffectPresetEditingProvider>
          <Inspector />
        </EffectPresetEditingProvider>
      )
    );
    const style = () =>
      host.querySelector<HTMLSelectElement>(
        '[aria-label="videoEditor.effectsLibrary.visualPreset"]'
      )!;
    const slider = [...host.querySelectorAll<HTMLInputElement>('input[type=range]')].find(
      (item) => Number(item.min) === first && Number(item.max) === second
    )!;
    expect(style().value).toBe('builtin:first');
    await change(slider, String(second));
    expect(slider.value).toBe(String(second));
    expect(style().value).toBe('builtin:first');
    await act(async () => slider.dispatchEvent(new Event('pointerup', { bubbles: true })));
    expect(style().value).toBe('builtin:second');
  }
);
