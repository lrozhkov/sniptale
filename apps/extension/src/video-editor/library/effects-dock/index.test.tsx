// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createTextClip } from '../../../features/video/project/factories/overlay-clip';
import {
  VideoTrackKind,
  VideoTransitionEasing,
  VideoTransitionKind,
} from '../../../features/video/project/types';
import { VideoEditorEffectsLibraryDock } from './index';
import { useEffectLibraryOperations, type EffectLibraryOperations } from './operations';
import { resolveEffectTransitionTargetId } from '../../workspace/surface/effects-library';
import { applyDroppedEffectDocument } from '../../workspace/surface/canvas';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders nothing while the EffectV1 dock is closed', () => {
  renderDock({ isOpen: false });
  expect(container?.querySelector('[data-ui="video-editor.effects-library.dock"]')).toBeNull();
});

it('exposes only targets that are available for each EffectV1 kind', async () => {
  const onApplyEffect = vi.fn(async () => 'instance-1');
  renderDock({ onApplyEffect, selectedClipId: null, selectedTransitionId: null });

  const standalone = findDocumentButton('standalone');
  const target = findDocumentButton('target');
  const transition = findDocumentButton('transition');
  expect(standalone.disabled).toBe(false);
  expect(target.disabled).toBe(true);
  expect(transition.disabled).toBe(true);

  await click(standalone);
  expect(onApplyEffect).toHaveBeenCalledWith(
    expect.objectContaining({
      documentId: 'standalone',
      startTime: 3,
      target: { kind: 'scene' },
    })
  );

  renderDock({ onApplyEffect, selectedClipId: 'clip-1', selectedTransitionId: 'transition-1' });
  expect(findDocumentButton('target').disabled).toBe(false);
  expect(findDocumentButton('transition').disabled).toBe(false);
});

it('imports only the selected EffectV1 file and clears the native input value', async () => {
  const onImportEffectFile = vi.fn(async () => undefined);
  renderDock({ onImportEffectFile });
  const input = container?.querySelector<HTMLInputElement>('input[type="file"]');
  const file = new File(['{}'], 'effect.sniptale-effect.json', { type: 'application/json' });
  if (!input) throw new Error('Expected EffectV1 file input');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });

  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));

  expect(onImportEffectFile).toHaveBeenCalledWith(file);
  expect(input.value).toBe('');
});

it('keeps an invalid EffectV1 catalog row visible with delete-only recovery', async () => {
  const onDeleteEffectBundle = vi.fn(async () => undefined);
  renderDock({
    catalogs: [{ packId: 'broken-pack', status: 'invalid' }],
    onDeleteEffectBundle,
  });
  const invalidRow = container?.querySelector<HTMLElement>('article[data-state="invalid"]');
  const buttons = invalidRow?.querySelectorAll('button');

  expect(invalidRow?.textContent).toContain('broken-pack');
  expect(buttons).toHaveLength(1);
  await click(buttons?.[0] as HTMLButtonElement);
  expect(onDeleteEffectBundle).toHaveBeenCalledWith('broken-pack');
});

it('does not expose a transition that already owns an EffectV1 instance', () => {
  const project = createEmptyVideoProject('occupied transition');
  const track = project.tracks.find(({ kind }) => kind === VideoTrackKind.OVERLAY)!;
  const leading = { ...createTextClip(track.id, project.width, project.height, 0), id: 'leading' };
  const trailing = {
    ...createTextClip(track.id, project.width, project.height, 1),
    id: 'trailing',
  };
  project.transitions = [
    {
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
      id: 'transition-1',
      kind: VideoTransitionKind.CROSSFADE,
      leadingClipId: 'leading',
      trailingClipId: 'trailing',
    },
  ];
  project.clips = [leading, trailing];
  project.effectInstances = [
    {
      controls: {},
      duration: 1,
      enabled: true,
      id: 'effect-1',
      kind: 'transition',
      playbackRate: 3,
      snapshotId: 'snapshot-1',
      startTime: 1,
      target: { kind: 'transition', transitionId: 'transition-1' },
    },
  ];

  expect(resolveEffectTransitionTargetId(project, 1.5, 'transition-1')).toBeNull();
});

it('surfaces a rejected dropped apply through the shared operation owner', async () => {
  const onApplyEffect = vi.fn(async () => {
    throw new Error('drop-apply-rejected');
  });
  act(() => root?.render(<DroppedEffectOperationHarness onApplyEffect={onApplyEffect} />));
  const dropButton = container?.querySelector<HTMLButtonElement>('[data-testid="drop-effect"]');
  if (!dropButton) throw new Error('Expected drop EffectV1 test control');

  await click(dropButton);

  expect(onApplyEffect).toHaveBeenCalledOnce();
  const alert = container?.querySelector('[role="alert"]')?.textContent;
  expect(alert).toContain('EFFECT_OPERATION_FAILED');
  expect(alert).not.toContain('drop-apply-rejected');
});

it('surfaces only an allowlisted EffectV1 diagnostic code', async () => {
  const onApplyEffect = vi.fn(async () => {
    throw Object.assign(new Error('private failure detail'), { code: 'BUNDLE_ARCHIVE_INVALID' });
  });
  act(() => root?.render(<DroppedEffectOperationHarness onApplyEffect={onApplyEffect} />));
  const dropButton = container?.querySelector<HTMLButtonElement>('[data-testid="drop-effect"]');
  if (!dropButton) throw new Error('Expected drop EffectV1 test control');

  await click(dropButton);

  const alert = container?.querySelector('[role="alert"]')?.textContent;
  expect(alert).toContain('BUNDLE_ARCHIVE_INVALID');
  expect(alert).not.toContain('private failure detail');
});

function DroppedEffectOperationHarness(props: {
  onApplyEffect: () => Promise<string | null>;
}): React.JSX.Element {
  const operations = useEffectLibraryOperations();
  const catalog = createCatalog();
  return (
    <>
      <button
        data-testid="drop-effect"
        onClick={() =>
          void applyDroppedEffectDocument({
            catalogs: [{ catalog, status: 'ready' }],
            onApplyEffectDocument: props.onApplyEffect,
            operations,
            payload: {
              documentId: 'standalone',
              kind: 'standalone',
              packId: catalog.packId,
            },
            startTime: 3,
            target: { kind: 'scene' },
          })
        }
        type="button"
      >
        drop
      </button>
      <VideoEditorEffectsLibraryDock
        catalogs={[{ catalog, status: 'ready' }]}
        currentTime={3}
        errorCode={null}
        isLoading={false}
        isOpen
        operations={operations}
        onAddAnnotation={vi.fn()}
        onApplyEffect={props.onApplyEffect}
        onClose={vi.fn()}
        onDeleteEffectBundle={vi.fn(async () => undefined)}
        onImportEffectFile={vi.fn(async () => undefined)}
        onSetEffectBundleEnabled={vi.fn(async () => undefined)}
        selectedClipId={null}
        selectedTransitionId={null}
      />
    </>
  );
}

function renderDock(
  overrides: Partial<React.ComponentProps<typeof VideoEditorEffectsLibraryDock>> = {}
): void {
  act(() => {
    root?.render(
      <VideoEditorEffectsLibraryDock
        catalogs={[{ catalog: createCatalog(), status: 'ready' }]}
        currentTime={3}
        errorCode={null}
        isLoading={false}
        isOpen
        operations={createOperations()}
        onAddAnnotation={vi.fn()}
        onApplyEffect={vi.fn(async () => null)}
        onClose={vi.fn()}
        onDeleteEffectBundle={vi.fn(async () => undefined)}
        onImportEffectFile={vi.fn(async () => undefined)}
        onSetEffectBundleEnabled={vi.fn(async () => undefined)}
        selectedClipId={null}
        selectedTransitionId={null}
        {...overrides}
      />
    );
  });
}

function createOperations(): EffectLibraryOperations {
  return {
    disabled: false,
    operationError: null,
    run: async (_kind, action) => {
      await action();
    },
  };
}

function createCatalog(): EffectBundleCatalogEntry {
  return {
    assets: [],
    createdAt: 1,
    description: { en: 'Description', ru: 'Описание' },
    documents: [
      createDocument('standalone', 'standalone'),
      createDocument('target', 'targetEffect'),
      createDocument('transition', 'transition'),
    ],
    enabled: true,
    label: { en: 'Effect bundle', ru: 'Набор эффектов' },
    packId: 'effect-pack',
    retainedByteLength: 2,
    source: 'raw-json',
    sourceSha256: 'source-sha',
    updatedAt: 2,
    version: '1.0.0',
  };
}

function createDocument(
  id: string,
  kind: EffectBundleCatalogEntry['documents'][number]['kind']
): EffectBundleCatalogEntry['documents'][number] {
  return {
    assets: [],
    id,
    kind,
    schemaVersion: 'sniptale.effect.v1',
    sha256: `${id}-sha`,
    source: '{}',
  };
}

function findDocumentButton(id: string): HTMLButtonElement {
  const label = [...(container?.querySelectorAll('p') ?? [])].find(
    (element) => element.textContent === id
  );
  const button = label?.parentElement?.parentElement?.querySelector('button');
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing button for ${id}`);
  return button;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}
