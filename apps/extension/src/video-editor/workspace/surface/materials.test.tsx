// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import {
  VideoProjectAssetType,
  type VideoProjectAsset,
} from '../../../features/video/project/types';
import type { VideoEditorMaterialPlacementResult } from '../../contracts/insertion';
import { VideoEditorMaterials } from './materials';
import { translate } from '../../../platform/i18n';

const container = document.createElement('div');
let root = createRoot(container);
afterEach(() => {
  act(() => root.unmount());
  root = createRoot(container);
  vi.unstubAllGlobals();
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
  const onAppend = vi.fn<(asset: VideoProjectAsset) => VideoEditorMaterialPlacementResult>(() => ({
    status: 'placed',
    clipId: 'clip-1',
  }));
  const onInsert = vi.fn<(asset: VideoProjectAsset) => VideoEditorMaterialPlacementResult>(() => ({
    status: 'placed',
    clipId: 'insert-1',
  }));
  const onImport = { audio: vi.fn(), image: vi.fn(), video: vi.fn() };
  const onOverlay = vi.fn<(asset: VideoProjectAsset) => VideoEditorMaterialPlacementResult>(() => ({
    status: 'placed',
    clipId: 'overlay-1',
  }));
  act(() =>
    root.render(
      <VideoEditorMaterials
        project={project}
        onAppend={onAppend}
        onInsert={onInsert}
        onOverlay={onOverlay}
        onImport={onImport}
      />
    )
  );
  return { asset, onAppend, onInsert, onOverlay, onImport, project };
}

it('selects a source without editing the timeline and reuses it for repeated explicit append', () => {
  const { asset, onAppend, project } = renderMaterials();
  const source = container.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
  const append = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === translate('videoEditor.app.materialsAppend')
  )!;
  expect(append.disabled).toBe(true);
  act(() => source.click());
  expect(source.getAttribute('aria-pressed')).toBe('true');
  expect(onAppend).not.toHaveBeenCalled();
  expect(project.clips).toEqual([]);
  act(() => append.click());
  act(() => append.click());
  expect(onAppend.mock.calls).toEqual([[asset], [asset]]);
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
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onImport.video).toHaveBeenCalledTimes(1);
  await act(async () => resolve?.());
  expect(container.querySelector('[aria-busy="true"]')).toBeNull();
});

it('explains rejected placement and clears the error after a successful retry', () => {
  const { onAppend } = renderMaterials();
  onAppend.mockReturnValue({ status: 'rejected', reason: 'locked-track' });
  act(() => container.querySelector<HTMLButtonElement>('button[aria-pressed]')!.click());
  const append = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === translate('videoEditor.app.materialsAppend')
  )!;
  act(() => append.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    translate('videoEditor.app.materialsLocked')
  );
  onAppend.mockReturnValue({ status: 'placed', clipId: 'clip-1' });
  act(() => append.click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it('dispatches overlay separately from append for the selected source', () => {
  const { asset, onAppend, onOverlay } = renderMaterials();
  act(() => container.querySelector<HTMLButtonElement>('button[aria-pressed]')!.click());
  const overlay = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === translate('videoEditor.app.materialsOverlay')
  )!;
  act(() => overlay.click());
  expect(onOverlay).toHaveBeenCalledWith(asset);
  expect(onAppend).not.toHaveBeenCalled();
});

it('inserts the selected material explicitly and explains an invalid cut', () => {
  const { asset, onAppend, onOverlay, onInsert } = renderMaterials();
  const insert = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === translate('videoEditor.app.materialsInsert')
  )!;
  expect(insert.disabled).toBe(true);
  act(() => container.querySelector<HTMLButtonElement>('button[aria-pressed]')!.click());
  onInsert.mockReturnValue({ status: 'rejected', reason: 'invalid-cut' });
  act(() => insert.click());
  expect(onInsert).toHaveBeenCalledWith(asset);
  expect(onAppend).not.toHaveBeenCalled();
  expect(onOverlay).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    translate('videoEditor.app.materialsInvalidCut')
  );
  onInsert.mockReturnValue({ status: 'placed', clipId: 'insert-1' });
  act(() => insert.click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
