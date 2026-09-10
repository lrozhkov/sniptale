// @vitest-environment jsdom

import { act } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import { translate } from '../../../platform/i18n';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import { createTextClip } from '../../../features/video/project/factories/overlay-clip';
import {
  VideoTrackKind,
  VideoTransitionEasing,
  VideoTransitionKind,
} from '../../../features/video/project/types';
import { EffectImportControl } from './header';
import { VideoEditorEffectsLibraryDock } from './index';
import { useEffectLibraryOperations, type EffectLibraryOperations } from './operations';
import { resolveEffectTransitionTargetId } from '../../workspace/surface/effects-library';
import { applyDroppedEffectDocument } from '../../workspace/surface/canvas';

vi.mock('../../../ui/effect-catalog-preview', () => ({
  EffectCatalogPreviewProvider: ({ children }: { children: React.ReactNode }) => children,
  EffectCatalogPreview: () => null,
}));

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

it('keeps import failure guidance in the padded scrollable content without internal-error copy', () => {
  renderDock({
    operations: {
      ...createOperations(),
      operationError: { kind: 'import', code: 'BUNDLE_ARCHIVE_INVALID' },
    },
  });
  const alert = container?.querySelector('[role="alert"]');
  expect(alert?.textContent).toBe(translate('videoEditor.effectsLibrary.importFailed'));
  expect(alert?.closest('[aria-busy]')?.className).toContain('flex-col');
});

it('shows catalog loading and a safe recovery message instead of diagnostic codes', () => {
  renderDock({ catalogs: [], isLoading: true });
  expect(container?.querySelector('[role="status"]')?.textContent).toBe(
    translate('videoEditor.effectsLibrary.catalogLoading')
  );
  renderDock({ catalogs: [], errorCode: 'EFFECT_CATALOG_FAILED' });
  const alert = container?.querySelector('[role="alert"]');
  expect(alert?.textContent).toBe(translate('videoEditor.effectsLibrary.catalogLoadFailed'));
  expect(alert?.textContent).not.toContain('EFFECT_CATALOG_FAILED');
  expect(container?.querySelector('[role="status"]')).toBeNull();
});

it('renders nothing while the EffectV1 dock is closed', () => {
  renderDock({ isOpen: false });
  expect(container?.querySelector('[data-ui="video-editor.effects-library.dock"]')).toBeNull();
});

it('uses the compact tokenized dock and user-facing EffectV1 target labels', () => {
  renderDock();

  const dock = container?.querySelector<HTMLElement>(
    '[data-ui="video-editor.effects-library.dock"]'
  );
  const documentRows = container?.querySelectorAll<HTMLElement>('[draggable="true"]');

  expect(dock?.className).toContain('h-full');
  expect(dock?.className).not.toContain('absolute');
  expect(documentRows).toHaveLength(3);
  expect(documentRows?.[0]?.className).toContain('var(--sniptale-color-surface-panel)');
  expect(findDocumentButton('target').title).toBe(
    translate('videoEditor.effectsLibrary.selectClipTarget')
  );
  expect(container?.textContent).not.toContain('targetEffect');
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
  expect(standalone.getAttribute('aria-label')).toBe(
    translate('videoEditor.effectsLibrary.applyToScene')
  );
  expect(target.getAttribute('aria-label')).toBe(
    translate('videoEditor.effectsLibrary.selectClipTarget')
  );
  expect(target.title).toBe(translate('videoEditor.effectsLibrary.selectClipTarget'));

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

it('imports selected EffectV1 files and clears the native input value', async () => {
  const onImportEffectFiles = vi.fn(async () => []);
  renderDock({ onImportEffectFiles });
  const input = container?.querySelector<HTMLInputElement>('input[type="file"]');
  const file = new File(['{}'], 'effect.sniptale-effect.json', { type: 'application/json' });
  if (!input) throw new Error('Expected EffectV1 file input');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });

  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));

  expect(onImportEffectFiles).toHaveBeenCalledWith([file]);
  expect(input.value).toBe('');
});

it('keeps catalog management out of the editor for invalid bundles', () => {
  renderDock({ catalogs: [{ packId: 'broken-pack', status: 'invalid' }] });
  expect(container?.querySelector('article[data-state="invalid"]')).toBeNull();
  expect(container?.textContent).toContain(translate('videoEditor.effectsLibrary.noSearchResults'));
});

it('does not expose a transition that already owns an EffectV1 instance', () => {
  const project = createEmptyVideoProject('occupied transition');
  project.tracks.push(createVideoProjectTrack('Annotations', 0, VideoTrackKind.PRIMARY));
  const track = project.tracks.find(({ name }) => name === 'Annotations')!;
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
  expect(alert).toBe(translate('videoEditor.effectsLibrary.applyFailed'));
  expect(alert).not.toContain('EFFECT_OPERATION_FAILED');
  expect(alert).not.toContain('drop-apply-rejected');
});

it('keeps allowlisted EffectV1 diagnostic codes out of routine feedback', async () => {
  const onApplyEffect = vi.fn(async () => {
    throw Object.assign(new Error('private failure detail'), { code: 'BUNDLE_ARCHIVE_INVALID' });
  });
  act(() => root?.render(<DroppedEffectOperationHarness onApplyEffect={onApplyEffect} />));
  const dropButton = container?.querySelector<HTMLButtonElement>('[data-testid="drop-effect"]');
  if (!dropButton) throw new Error('Expected drop EffectV1 test control');

  await click(dropButton);

  const alert = container?.querySelector('[role="alert"]')?.textContent;
  expect(alert).toBe(translate('videoEditor.effectsLibrary.applyFailed'));
  expect(alert).not.toContain('BUNDLE_ARCHIVE_INVALID');
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
        onApplyEffect={props.onApplyEffect}
        onDeleteEffectBundle={vi.fn(async () => undefined)}
        onImportEffectFiles={vi.fn(async () => [])}
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
        onApplyEffect={vi.fn(async () => null)}
        onDeleteEffectBundle={vi.fn(async () => undefined)}
        onImportEffectFiles={vi.fn(async () => [])}
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
  const row = [...(container?.querySelectorAll('[data-effect-document]') ?? [])].find(
    (element) => element.getAttribute('data-effect-document') === id
  );
  const button = row?.querySelector('button');
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing button for ${id}`);
  return button;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

it('opens the picker, ignores its cancellation and resets it after a selected pack', async () => {
  const onImport = vi.fn(async () => []);
  const run = vi.fn(async (_kind: 'import', action: () => Promise<unknown>) => {
    await action();
  });
  act(() => root?.render(<EffectImportControl disabled={false} onImport={onImport} run={run} />));
  const input = container!.querySelector('input')!;
  const open = vi.spyOn(input, 'click');
  act(() => container!.querySelector('button')!.click());
  expect(open).toHaveBeenCalledOnce();
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(run).not.toHaveBeenCalled();
  const file = new File(['{}'], 'pack.sniptale-effect.json');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onImport).toHaveBeenCalledWith([file]);
  expect(input.value).toBe('');
  act(() => root?.render(<EffectImportControl disabled onImport={onImport} run={run} />));
  expect(container!.querySelector('button')!.disabled).toBe(true);
});

it('presents the imported document label instead of its internal identifier', () => {
  const catalog = createCatalog();
  catalog.documents[1]!.source = readFileSync(
    'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-target-effect.sniptale-effect.json',
    'utf8'
  );
  renderDock({ catalogs: [{ catalog, status: 'ready' }] });
  expect(container?.textContent).toContain('Neutral Target Effect');
  expect(container?.textContent).not.toContain('effect-pack');
  expect(container?.textContent).not.toContain('EffectV1');
});

it('filters document names and restores the catalog after an empty search', () => {
  const catalog = createCatalog();
  catalog.documents[1]!.source = readFileSync(
    'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-target-effect.sniptale-effect.json',
    'utf8'
  );
  renderDock({ catalogs: [{ catalog, status: 'ready' }] });
  act(() =>
    container!
      .querySelector<HTMLButtonElement>(
        `button[title="${translate('videoEditor.effectsLibrary.searchPlaceholder')}"]`
      )!
      .click()
  );
  const input = container!.querySelector<HTMLInputElement>('input:not([type="file"])')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  const search = (value: string) =>
    act(() => {
      setValue.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  search('Neutral');
  expect(container?.querySelectorAll('[data-effect-document]')).toHaveLength(1);
  expect(container?.textContent).toContain('Neutral Target Effect');
  search('not-in-this-catalog');
  expect(container?.querySelectorAll('[data-effect-document]')).toHaveLength(0);
  expect(container?.querySelector('[role="status"]')?.textContent).toBe(
    translate('videoEditor.effectsLibrary.noSearchResults')
  );
  search('');
  expect(container?.querySelectorAll('[data-effect-document]')).toHaveLength(3);
});
