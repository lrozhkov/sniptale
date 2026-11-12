// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { createEffectInstanceGroups } from './groups';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('preserves an off-scene handle coordinate when committing its existing value', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseAnimationTemplateSource } =
    await import('@sniptale/runtime-contracts/animation-template');
  const source = readFileSync(
    'apps/extension/public/video-effects/animations/callout.sniptale-animation.json',
    'utf8'
  );
  const parsed = parseAnimationTemplateSource(source);
  if (!parsed.template) throw new Error('Expected callout fixture');
  const handle = parsed.template.objectLayout!.handles![0]!;
  const project = createEmptyVideoProject('Handle');
  project.effectSnapshots = [
    {
      id: 'snapshot',
      documentId: parsed.template.id,
      kind: 'standalone',
      assets: [],
      retainedByteLength: new TextEncoder().encode(source).length,
      schemaVersion: 'sniptale.animation.v1',
      sha256: '0'.repeat(64),
      source,
    },
  ];
  project.effectInstances = [
    {
      id: 'callout',
      kind: 'standalone',
      snapshotId: 'snapshot',
      enabled: true,
      controls: {},
      duration: 3,
      playbackRate: 1,
      startTime: 0,
      target: { kind: 'scene' },
      sceneAnchors: { [handle.id]: { x: -120, y: 900 } },
    },
  ];
  const update = vi.fn();
  act(() =>
    root.render(
      createEffectInstanceGroups({
        project,
        instanceId: 'callout',
        target: { kind: 'scene' },
        onUpdateEffectInstance: update,
        onDeleteEffectInstance: vi.fn(),
        onDuplicateEffectInstance: vi.fn(() => null),
        onMoveEffectInstance: vi.fn(),
      }).map((group) => (
        <div key={group.id} data-semantic={group.semantic}>
          {group.content}
        </div>
      ))
    )
  );
  expect(
    [...container.querySelectorAll('[data-semantic]')].map((node) =>
      node.getAttribute('data-semantic')
    )
  ).toEqual(['effects', 'content', 'typography', 'appearance', 'geometry']);
  const input = [...container.querySelectorAll<HTMLInputElement>('input')].find((node) =>
    node.getAttribute('aria-label')?.endsWith('· X')
  )!;
  expect(input.closest('[data-semantic]')?.getAttribute('data-semantic')).toBe('geometry');
  expect(container.querySelectorAll('input[aria-label$="· X"]')).toHaveLength(1);
  act(() => input.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '-150');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(update).not.toHaveBeenCalledWith(
    'callout',
    expect.objectContaining({ sceneAnchors: { [handle.id]: { x: 0, y: 900 } } })
  );
  expect(update).toHaveBeenCalledWith('callout', {
    sceneAnchors: { [handle.id]: { x: -150, y: 900 } },
  });
});

it('renders promoted advanced controls without a duplicate disclosure', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseAnimationTemplateSource } =
    await import('@sniptale/runtime-contracts/animation-template');
  const fixtureSource = readFileSync(
    'apps/extension/public/video-effects/animations/callout.sniptale-animation.json',
    'utf8'
  );
  const document = JSON.parse(fixtureSource);
  document.controls.find((control: { id: string }) => control.id === 'opacity').group = 'advanced';
  const source = JSON.stringify(document);
  const parsed = parseAnimationTemplateSource(source);
  if (!parsed.template) throw new Error('Expected callout fixture');
  const handle = parsed.template.objectLayout!.handles![0]!;
  const project = createEmptyVideoProject('Handle');
  project.effectSnapshots = [
    {
      id: 'snapshot',
      documentId: parsed.template.id,
      kind: 'standalone',
      assets: [],
      retainedByteLength: new TextEncoder().encode(source).length,
      schemaVersion: 'sniptale.animation.v1',
      sha256: '0'.repeat(64),
      source,
    },
  ];
  project.effectInstances = [
    {
      id: 'callout',
      kind: 'standalone',
      snapshotId: 'snapshot',
      enabled: true,
      controls: {},
      duration: 3,
      playbackRate: 1,
      startTime: 0,
      target: { kind: 'scene' },
      sceneAnchors: { [handle.id]: { x: -120, y: 900 } },
    },
  ];
  const update = vi.fn();
  act(() =>
    root.render(
      createEffectInstanceGroups({
        project,
        instanceId: 'callout',
        target: { kind: 'scene' },
        onUpdateEffectInstance: update,
        onDeleteEffectInstance: vi.fn(),
        onDuplicateEffectInstance: vi.fn(() => null),
        onMoveEffectInstance: vi.fn(),
      }).map((group) => (
        <div key={group.id} data-semantic={group.semantic}>
          {group.content}
        </div>
      ))
    )
  );
  const advanced = container.querySelector('[data-semantic="advanced"]')!;
  expect(advanced).not.toBeNull();
  expect(advanced.querySelector('details')).toBeNull();
  expect(advanced.querySelector('input,button')).not.toBeNull();
});

it('keeps standalone annotation disclosures independent', async () => {
  const { InspectorDisclosurePreferences } =
    await import('../../../../../composition/inspector-disclosures/state');
  const { createInspectorDisclosureStore } =
    await import('../../../../../composition/persistence/inspector-disclosures/store');
  const project = createEmptyVideoProject('Nested effects');
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    'apps/extension/public/video-effects/animations/callout.sniptale-animation.json',
    'utf8'
  );
  project.effectSnapshots = [
    {
      id: 'blur',
      documentId: 'sniptale-callout',
      kind: 'standalone',
      assets: [],
      retainedByteLength: new TextEncoder().encode(source).length,
      schemaVersion: 'sniptale.animation.v1',
      sha256: '0'.repeat(64),
      source,
    },
  ];
  project.effectInstances = ['first', 'second'].map((id) => ({
    id,
    kind: 'standalone',
    snapshotId: 'blur',
    enabled: true,
    controls: {},
    duration: 2,
    playbackRate: 1,
    startTime: 0,
    target: { kind: 'scene' },
  }));
  const groups = createEffectInstanceGroups({
    project,
    target: { kind: 'scene' },
    onDeleteEffectInstance: vi.fn(),
    onDuplicateEffectInstance: vi.fn(() => null),
    onMoveEffectInstance: vi.fn(),
    onUpdateEffectInstance: vi.fn(),
  });
  expect(groups.map((group) => group.id)).toEqual(['effect-v1']);
  await act(async () =>
    root.render(
      <InspectorDisclosurePreferences scope="video:track" store={createInspectorDisclosureStore()}>
        {groups[0]!.content}
      </InspectorDisclosurePreferences>
    )
  );
  const disclosures = container.querySelectorAll('details');
  expect(disclosures).toHaveLength(2);
  expect(disclosures[0]!.open).toBe(true);
  expect(disclosures[1]!.open).toBe(true);
  await act(async () => {
    disclosures[0]!.open = false;
    disclosures[0]!.dispatchEvent(new Event('toggle'));
  });
  expect(disclosures[0]!.open).toBe(false);
  expect(disclosures[1]!.open).toBe(true);
  expect(disclosures[1]!.querySelector('input')).not.toBeNull();
  expect(disclosures[1]!.textContent).toContain('Текст');
});

it.each(['move', 'sparkles'] as const)(
  'keeps nested %s from repeating the surrounding host groups',
  async (icon) => {
    const { readFileSync } = await import('node:fs');
    const { parseAnimationTemplateSource } =
      await import('@sniptale/runtime-contracts/animation-template');
    const value = JSON.parse(
      readFileSync(
        'apps/extension/public/video-effects/animations/callout.sniptale-animation.json',
        'utf8'
      )
    );
    value.controlGroups = [
      { id: 'tracing', label: { en: 'Tracing' }, parentId: 'appearance', icon },
    ];
    value.controls.find((control: { id: string }) => control.id === 'opacity').group = 'tracing';
    const source = JSON.stringify(value),
      parsed = parseAnimationTemplateSource(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.template) throw Error('Missing callout');
    const project = createEmptyVideoProject();
    project.effectSnapshots = [
      {
        id: 'snapshot',
        documentId: parsed.template.id,
        kind: 'standalone',
        assets: [],
        retainedByteLength: new TextEncoder().encode(source).byteLength,
        schemaVersion: 'sniptale.animation.v1',
        sha256: '0'.repeat(64),
        source,
      },
    ];
    project.effectInstances = [
      {
        id: 'custom',
        snapshotId: 'snapshot',
        kind: 'standalone',
        enabled: true,
        controls: {},
        duration: 3,
        playbackRate: 1,
        startTime: 0,
        target: { kind: 'scene' },
      },
    ];
    act(() =>
      root.render(
        createEffectInstanceGroups({
          project,
          instanceId: 'custom',
          target: { kind: 'scene' },
          onUpdateEffectInstance: vi.fn(),
          onDeleteEffectInstance: vi.fn(),
          onDuplicateEffectInstance: vi.fn(() => null),
          onMoveEffectInstance: vi.fn(),
        }).map((group) => <div key={group.id}>{group.content}</div>)
      )
    );
    expect(container.querySelectorAll(`summary svg.lucide-${icon}`)).toHaveLength(0);
    expect(container.querySelector('[data-effect-control-group="tracing"] input')).not.toBeNull();
  }
);
