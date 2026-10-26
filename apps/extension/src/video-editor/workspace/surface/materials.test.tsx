// @vitest-environment jsdom
import { createQuickEditWatermark } from '../../../features/video/project/scene/watermark';

import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { act } from 'react';
import { useActiveCanvasInsertEscape } from '@sniptale/ui/canvas-tools';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { VideoEditorMaterials } from './materials';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import { translate } from '../../../platform/i18n';

const materialDrag = vi.hoisted(() => ({ pending: false, start: vi.fn() }));
vi.mock('../../chrome/material-drag', () => ({ useMaterialDrag: () => materialDrag }));
const onOpenLibrary = vi.fn();
const container = document.createElement('div');
let root = createRoot(container);
afterEach(() => {
  act(() => root.unmount());
  root = createRoot(container);
  container.remove();
  vi.unstubAllGlobals();
  materialDrag.pending = false;
  materialDrag.start.mockClear();
});

function renderMaterials() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const project = createEmptyVideoProject();
  const asset = createVideoProjectAsset(
    'Screen.webm',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 1280,
      height: 720,
      duration: 4,
      mimeType: 'video/webm',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  project.assets = [asset];
  const onSelect = vi.fn();
  const onRename = vi.fn();
  const onRemoveUnused = vi.fn();
  const onImport = { audio: vi.fn(), image: vi.fn(), video: vi.fn() };
  act(() =>
    root.render(
      <VideoEditorMaterials
        onRename={onRename}
        onShowUse={vi.fn()}
        onRemoveUnused={onRemoveUnused}
        onOpenLibrary={onOpenLibrary}
        project={project}
        selectedAssetId={null}
        onSelect={onSelect}
        onImport={onImport}
      />
    )
  );
  return { asset, onSelect, onRename, onImport, project, onRemoveUnused };
}

it('opens the selected source without editing the timeline or filling the list with placement controls', () => {
  const { asset, onSelect, project } = renderMaterials();
  act(() =>
    container.querySelector<HTMLButtonElement>('[data-material-id] button[aria-pressed]')!.click()
  );
  expect(onSelect).toHaveBeenCalledWith(asset);
  expect(project.clips).toEqual([]);
  expect(container.textContent).not.toContain(translate('videoEditor.app.materialsAppend'));
});

it('uses the same quiet, outlined hover and keyboard-focus treatment for material actions', () => {
  const { asset, project, onImport, onSelect, onRemoveUnused } = renderMaterials();
  project.clips = [createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720, 0)];
  act(() =>
    root.render(
      <VideoEditorMaterials
        onRename={vi.fn()}
        onShowUse={vi.fn()}
        onRemoveUnused={onRemoveUnused}
        onOpenLibrary={onOpenLibrary}
        project={project}
        selectedAssetId={null}
        onSelect={onSelect}
        onImport={onImport}
      />
    )
  );
  const rename = container.querySelector<HTMLButtonElement>('[data-material-rename]')!;
  const showUse = container.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.materials.show-use"] button'
  )!;
  expect(rename).not.toBeNull();
  expect(showUse).not.toBeNull();
  for (const button of [rename, showUse]) {
    expect(button.className).toContain('!bg-transparent');
    expect(button.className).toContain('hover:!bg-transparent');
    expect(button.className).toContain('hover:!border-[var(--sniptale-color-border-strong)]');
    expect(button.className).toContain(
      'focus-visible:!border-[var(--sniptale-color-border-accent-strong)]'
    );
    expect(button.className).not.toContain('opacity-0');
  }
});

it('includes library recordings alongside local video in the Video category', async () => {
  const { asset, project, onImport, onSelect, onRemoveUnused } = renderMaterials();
  document.body.append(container);
  project.assets.push(
    {
      ...asset,
      id: 'library-recording',
      type: VideoProjectAssetType.RECORDING,
      name: 'Recorded screen.webm',
    },
    { ...asset, id: 'image', type: VideoProjectAssetType.IMAGE, name: 'Screenshot.png' }
  );
  act(() =>
    root.render(
      <VideoEditorMaterials
        onRename={vi.fn()}
        project={project}
        onImport={onImport}
        onSelect={onSelect}
        onRemoveUnused={onRemoveUnused}
        onOpenLibrary={onOpenLibrary}
        onShowUse={vi.fn()}
        selectedAssetId={null}
      />
    )
  );
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        `[aria-label="${translate('videoEditor.sidebar.materialsCategory')}"]`
      )!
      .click()
  );
  const videoOption = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (option) => option.textContent === translate('videoEditor.app.materialsVideo')
  );
  expect(videoOption).toBeDefined();
  await act(async () => videoOption!.click());
  expect(
    Array.from(container.querySelectorAll('[data-material-id]')).map((row) =>
      row.getAttribute('data-material-id')
    )
  ).toEqual([asset.id, 'library-recording']);
});

it('imports only into materials and rejects duplicate file input while loading', async () => {
  const { onImport } = renderMaterials();
  let resolve: (() => void) | undefined;
  onImport.video.mockReturnValue(
    new Promise<void>((done) => {
      resolve = done;
    })
  );
  const input = container.querySelector<HTMLInputElement>('input[accept*="video/"]')!;
  const file = new File(['video'], 'Video.webm', { type: 'video/webm' });
  Object.defineProperty(input, 'files', { value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onImport.video).toHaveBeenCalledWith(file, { destination: 'materials' });
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(
    container.querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.import"]')
      ?.disabled
  ).toBe(true);
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onImport.video).toHaveBeenCalledTimes(1);
  await act(async () => resolve?.());
  expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  expect(
    container.querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.import"]')
      ?.disabled
  ).toBe(false);
});

function ArmedInsertion({ onCancel }: { onCancel: () => void }) {
  useActiveCanvasInsertEscape({ active: true, onCancel });
  return null;
}

it('dismisses Import before the armed canvas insertion and restores its trigger', () => {
  const { project, onImport, onSelect } = renderMaterials();
  const onCancel = vi.fn();
  document.body.append(container);
  act(() =>
    root.render(
      <>
        <ArmedInsertion onCancel={onCancel} />
        <VideoEditorMaterials
          onRename={vi.fn()}
          onShowUse={vi.fn()}
          onRemoveUnused={vi.fn()}
          onOpenLibrary={onOpenLibrary}
          project={project}
          onImport={onImport}
          onSelect={onSelect}
          selectedAssetId={null}
        />
      </>
    )
  );
  const trigger = container.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.materials.import"]'
  )!;
  act(() => trigger.click());
  const menu = document.querySelector('[data-ui="video-editor.materials.import-menu"]')!;
  expect(menu.contains(document.activeElement)).toBe(true);
  act(() =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(document.querySelector('[data-ui="video-editor.materials.import-menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(onCancel).not.toHaveBeenCalled();
  act(() =>
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it('yields focus to an inspector select without retaining a competing menu layer', async () => {
  const { project, onImport, onSelect } = renderMaterials();
  const onCancel = vi.fn();
  document.body.append(container);
  act(() =>
    root.render(
      <>
        <ArmedInsertion onCancel={onCancel} />
        <CompactSelect
          aria-label="Inspector setting"
          value="one"
          onChange={vi.fn()}
          options={[
            { value: 'one', label: 'One' },
            { value: 'two', label: 'Two' },
          ]}
        />
        <VideoEditorMaterials
          onRename={vi.fn()}
          onShowUse={vi.fn()}
          onRemoveUnused={vi.fn()}
          onOpenLibrary={onOpenLibrary}
          project={project}
          onImport={onImport}
          onSelect={onSelect}
          selectedAssetId={null}
        />
      </>
    )
  );
  const trigger = container.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.materials.import"]'
  )!;
  act(() => trigger.click());
  const select = container.querySelector<HTMLButtonElement>('[aria-label="Inspector setting"]')!;
  act(() => select.focus());
  expect(document.querySelector('[data-ui="video-editor.materials.import-menu"]')).toBeNull();
  expect(document.activeElement).toBe(select);
  act(() =>
    select.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
  );
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  await act(
    async () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
  );
  expect(document.querySelector('[role="listbox"]')!.contains(document.activeElement)).toBe(true);
  act(() =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(select);
  expect(onCancel).not.toHaveBeenCalled();
});

it('opens the library independently from the local file import menu', () => {
  const { onImport } = renderMaterials();
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.library"]')!
      .click()
  );
  expect(onOpenLibrary).toHaveBeenCalled();
  expect(onImport.video).not.toHaveBeenCalled();
  expect(container.querySelector('[data-ui="video-editor.materials.import-menu"]')).toBeNull();
});

it('anchors import in the footer and only exposes removal for unused materials', () => {
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const { project, asset, onRemoveUnused, onImport, onSelect } = renderMaterials();
  const footer = container.querySelector('[data-ui="video-editor.materials.footer"]')!;
  expect(footer.parentElement?.lastElementChild).toBe(footer);
  expect(footer.querySelector('[data-ui="video-editor.materials.library"]')).not.toBeNull();
  expect(container.textContent).toContain(translate('videoEditor.app.materialsUnused'));
  act(() =>
    container.querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.remove"]')!.click()
  );
  expect(onRemoveUnused).toHaveBeenCalledWith([asset.id]);
  act(() =>
    footer
      .querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.remove-unused"]')!
      .click()
  );
  expect(onRemoveUnused).toHaveBeenCalledWith(undefined);
  project.clips = [createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720, 0)];
  act(() =>
    root.render(
      <VideoEditorMaterials
        onRename={vi.fn()}
        onShowUse={vi.fn()}
        project={project}
        selectedAssetId={asset.id}
        onOpenLibrary={onOpenLibrary}
        onRemoveUnused={onRemoveUnused}
        onImport={onImport}
        onSelect={onSelect}
      />
    )
  );
  expect(container.querySelector('[data-ui="video-editor.materials.remove"]')).toBeNull();
  expect(
    container.querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.remove-unused"]')!
      .disabled
  ).toBe(true);
  expect(container.textContent).toContain(translate('videoEditor.app.materialsUsed'));
});

it('filters used materials and searches names without changing the bulk-removal scope', () => {
  const { asset, project, onImport, onSelect, onRemoveUnused } = renderMaterials();
  project.assets.push({ ...asset, id: 'unused', name: 'Unused.webm' });
  project.clips = [createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720, 0)];
  act(() =>
    root.render(
      <VideoEditorMaterials
        onRename={vi.fn()}
        onShowUse={vi.fn()}
        project={project}
        onImport={onImport}
        onSelect={onSelect}
        onRemoveUnused={onRemoveUnused}
        onOpenLibrary={onOpenLibrary}
        selectedAssetId={null}
      />
    )
  );
  const rows = () =>
    Array.from(container.querySelectorAll('[data-material-id]')).map((n) =>
      n.getAttribute('data-material-id')
    );
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        `[aria-label="${translate('videoEditor.sidebar.materialsHideUsed')}"]`
      )!
      .click()
  );
  expect(rows()).toEqual(['unused']);
  act(() =>
    container.querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.search"]')!.click()
  );
  const input = container.querySelector<HTMLInputElement>(
    `[aria-label="${translate('videoEditor.sidebar.materialsSearch')}"]`
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'missing'
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(rows()).toEqual([]);
  expect(container.textContent).toContain(translate('videoEditor.sidebar.materialsNoMatches'));
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.remove-unused"]')!
      .click()
  );
  expect(onRemoveUnused).toHaveBeenCalledWith(undefined);
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        `[aria-label="${translate('videoEditor.sidebar.materialsCloseSearch')}"]`
      )!
      .click()
  );
  expect(rows()).toEqual(['unused']);
  expect(onSelect).not.toHaveBeenCalled();
});

it('starts a local material drag from the source button and prevents it while placement is pending', () => {
  const { asset } = renderMaterials();
  const button = container.querySelector<HTMLButtonElement>(
    '[data-material-id] button[aria-pressed]'
  )!;
  expect(button.draggable).toBe(true);
  const transfer = { setData: vi.fn() };
  const drag = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(drag, 'dataTransfer', { value: transfer });
  act(() => button.dispatchEvent(drag));
  expect(materialDrag.start).toHaveBeenCalledWith(asset.id, button, transfer);
  materialDrag.pending = true;
  renderMaterials();
  const pendingButton = container.querySelector<HTMLButtonElement>(
    '[data-material-id] button[aria-pressed]'
  )!;
  expect(pendingButton.draggable).toBe(false);
  const blocked = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(blocked, 'dataTransfer', { value: transfer });
  act(() => pendingButton.dispatchEvent(blocked));
  expect(blocked.defaultPrevented).toBe(true);
  expect(materialDrag.start).toHaveBeenCalledTimes(1);
});

it('clears material search without dismissing it or activating a source', () => {
  const { onSelect } = renderMaterials();
  document.body.append(container);
  act(() =>
    container.querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.search"]')!.click()
  );
  const input = container.querySelector<HTMLInputElement>('input:not([type="file"])')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'missing'
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(container.querySelector('[data-material-id]')).toBeNull();
  act(() => container.querySelector<HTMLButtonElement>('.sniptale-field-clear')!.click());
  expect(input.value).toBe('');
  expect(document.activeElement).toBe(input);
  expect(container.querySelector('[data-material-id]')).not.toBeNull();
  expect(container.querySelector('[data-ui="video-editor.materials.search"]')).toBeNull();
  expect(onSelect).not.toHaveBeenCalled();
});

it('clears a rename draft without committing and Escape retains the source name', () => {
  const { asset, onRename } = renderMaterials();
  document.body.append(container);
  act(() => container.querySelector<HTMLButtonElement>('[data-material-rename]')!.click());
  const input = container.querySelector<HTMLInputElement>('input:not([type="file"])')!;
  act(() => container.querySelector<HTMLButtonElement>('.sniptale-field-clear')!.click());
  expect(input.value).toBe('');
  expect(document.activeElement).toBe(input);
  expect(onRename).not.toHaveBeenCalled();
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(container.querySelector('input:not([type="file"])')).toBeNull();
  expect(
    container.querySelector('[data-material-id] button[aria-pressed]')?.getAttribute('aria-label')
  ).toBe(asset.name);
  expect(onRename).not.toHaveBeenCalled();
});

it('shows dormant text sources as in use without offering an unavailable clip jump', () => {
  const { asset, project, onImport, onSelect, onRemoveUnused } = renderMaterials();
  project.version = 5;
  project.textDocuments = [
    {
      id: 'retained',
      binding: { kind: 'source', assetId: asset.id, sourceInstanceId: 'hidden' },
      document: { version: 1, fragments: [] },
    },
  ];
  act(() =>
    root.render(
      <VideoEditorMaterials
        onRename={vi.fn()}
        onShowUse={vi.fn()}
        onRemoveUnused={onRemoveUnused}
        onOpenLibrary={onOpenLibrary}
        project={project}
        selectedAssetId={null}
        onSelect={onSelect}
        onImport={onImport}
      />
    )
  );
  expect(container.querySelector('[data-ui="video-editor.materials.remove"]')).toBeNull();
  expect(container.querySelector('[data-ui="video-editor.materials.show-use"]')).toBeNull();
  const cleanup = container.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.materials.remove-unused"]'
  )!;
  expect(cleanup.disabled).toBe(true);
  act(() => cleanup.click());
  expect(onRemoveUnused).not.toHaveBeenCalled();
});

it('reveals a dormant watermark as a watermark and protects its material from removal', async () => {
  const { asset, project, onImport, onSelect, onRename, onRemoveUnused } = renderMaterials();
  asset.type = VideoProjectAssetType.IMAGE;
  asset.name = 'Logo.png';
  project.version = 20;
  project.watermark = {
    ...createQuickEditWatermark('Retained'),
    image: {
      assetId: `project-asset:${asset.id}`,
      width: asset.metadata.width,
      height: asset.metadata.height,
      size: 0.2,
      opacity: 1,
    },
  };
  const onShowUse = vi.fn();
  document.body.append(container);
  await act(async () =>
    root.render(
      <VideoEditorMaterials
        project={project}
        onImport={onImport}
        onSelect={onSelect}
        onRename={onRename}
        onRemoveUnused={onRemoveUnused}
        onOpenLibrary={onOpenLibrary}
        onShowUse={onShowUse}
        selectedAssetId={null}
      />
    )
  );
  expect(container.querySelector('[data-ui="video-editor.materials.remove"]')).toBeNull();
  expect(
    container.querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.remove-unused"]')!
      .disabled
  ).toBe(true);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.show-use"] button')!
      .click()
  );
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  const watermark = options.find(
    (option) => option.textContent === translate('gallery.videoReview.watermark')
  );
  expect(watermark).toBeDefined();
  expect(
    options.some(
      (option) => option.textContent === translate('videoEditor.sidebar.materialsSceneUse')
    )
  ).toBe(false);
  await act(async () => watermark!.click());
  expect(onShowUse).toHaveBeenCalledExactlyOnceWith({ assetId: asset.id, kind: 'watermark' });
  expect(onSelect).not.toHaveBeenCalled();
  expect(onRemoveUnused).not.toHaveBeenCalled();
});

it('reveals a dormant source audio use and prevents removal of its retained material', async () => {
  const { asset, project, onImport, onSelect, onRename, onRemoveUnused } = renderMaterials();
  project.version = 28;
  project.sourceAudioDocuments = [
    {
      id: 'envelope',
      binding: { kind: 'source', assetId: asset.id, sourceInstanceId: 'dormant' },
      ranges: [{ id: 'gain', start: 0, end: 1, volume: 2 }],
      mutes: [],
    },
  ];
  const onShowUse = vi.fn();
  document.body.append(container);
  await act(async () =>
    root.render(
      <VideoEditorMaterials
        project={project}
        onImport={onImport}
        onSelect={onSelect}
        onRename={onRename}
        onRemoveUnused={onRemoveUnused}
        onOpenLibrary={onOpenLibrary}
        onShowUse={onShowUse}
        selectedAssetId={null}
      />
    )
  );
  expect(container.querySelector('[data-ui="video-editor.materials.remove"]')).toBeNull();
  expect(
    container.querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.remove-unused"]')!
      .disabled
  ).toBe(true);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.show-use"] button')!
      .click()
  );
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (option) => option.textContent === translate('videoEditor.sidebar.sourceAudio')
  );
  expect(option).toBeDefined();
  await act(async () => option!.click());
  expect(onShowUse).toHaveBeenCalledExactlyOnceWith({
    assetId: asset.id,
    kind: 'source-audio',
    documentId: 'envelope',
  });
  expect(onRemoveUnused).not.toHaveBeenCalled();
});

it('reveals the exact disabled dormant voice document from its retained source material', async () => {
  const { asset, project, onImport, onSelect, onRename, onRemoveUnused } = renderMaterials();
  const track = createVideoProjectTrack('Voice', 1, 'AUDIO');
  const voiceAsset = createVideoProjectAsset(
    'Voice',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'voice' },
    { ...asset.metadata, width: 0, height: 0, mimeType: 'audio/wav', hasAudio: true }
  );
  project.tracks.push(track);
  project.assets.push(voiceAsset);
  project.version = 31;
  project.sourceVoiceoverDocuments = [
    {
      id: 'whole-voice',
      enabled: false,
      trackId: track.id,
      binding: { kind: 'source', assetId: asset.id, sourceInstanceId: 'dormant-source' },
      reference: [
        { kind: 'keep', rate: 1, sourceStart: 0, sourceEnd: 4, resultStart: 0, resultEnd: 4 },
      ],
      take: {
        id: 'take',
        assetId: voiceAsset.id,
        timelineStart: 0,
        sourceOffset: 0,
        duration: 1,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
        dormant: true,
      },
    },
  ];
  const onShowUse = vi.fn();
  document.body.append(container);
  await act(async () =>
    root.render(
      <VideoEditorMaterials
        project={project}
        onImport={onImport}
        onSelect={onSelect}
        onRename={onRename}
        onRemoveUnused={onRemoveUnused}
        onOpenLibrary={onOpenLibrary}
        onShowUse={onShowUse}
        selectedAssetId={null}
      />
    )
  );
  const row = container.querySelector(`[data-material-id="${asset.id}"]`)!;
  await act(async () =>
    row
      .querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.show-use"] button')!
      .click()
  );
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (option) => option.textContent === translate('gallery.videoReview.audioVoiceover')
  );
  expect(option).toBeDefined();
  await act(async () => option!.click());
  expect(onShowUse).toHaveBeenCalledExactlyOnceWith({
    assetId: asset.id,
    kind: 'source-voiceover',
    documentId: 'whole-voice',
  });
  expect(onRemoveUnused).not.toHaveBeenCalled();
});

it('protects a retained cut source from unused cleanup and exposes its settings destination', async () => {
  const f = renderMaterials(),
    onShowUse = vi.fn();
  f.project.version = 40;
  f.project.compositionJoins = [
    {
      id: 'retained-cut',
      sampling: 'cut',
      sourceRange: { assetId: f.asset.id, sourceInstanceId: 'original', start: 0, end: 1 },
    },
  ];
  document.body.append(container);
  await act(async () =>
    root.render(
      <VideoEditorMaterials
        project={f.project}
        onImport={f.onImport}
        onSelect={f.onSelect}
        onRename={f.onRename}
        onRemoveUnused={f.onRemoveUnused}
        onOpenLibrary={onOpenLibrary}
        onShowUse={onShowUse}
        selectedAssetId={null}
      />
    )
  );
  expect(container.querySelector('[data-ui="video-editor.materials.remove"]')).toBeNull();
  expect(
    container.querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.remove-unused"]')!
      .disabled
  ).toBe(true);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.show-use"] button')!
      .click()
  );
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
    option.textContent?.startsWith(translate('videoEditor.sidebar.compositionJoins'))
  );
  expect(option).toBeDefined();
  await act(async () => option!.click());
  expect(onShowUse).toHaveBeenCalledExactlyOnceWith({
    assetId: f.asset.id,
    kind: 'composition-join',
    joinId: 'retained-cut',
  });
  expect(f.onRemoveUnused).not.toHaveBeenCalled();
});
