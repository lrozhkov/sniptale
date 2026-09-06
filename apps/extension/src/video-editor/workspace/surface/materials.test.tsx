// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../../features/video/project/types';
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
  const onSelect = vi.fn();
  const onImport = { audio: vi.fn(), image: vi.fn(), video: vi.fn() };
  act(() =>
    root.render(
      <VideoEditorMaterials
        project={project}
        selectedAssetId={null}
        onSelect={onSelect}
        onImport={onImport}
      />
    )
  );
  return { asset, onSelect, onImport, project };
}

it('opens the selected source without editing the timeline or filling the list with placement controls', () => {
  const { asset, onSelect, project } = renderMaterials();
  act(() => container.querySelector<HTMLButtonElement>('button[aria-pressed]')!.click());
  expect(onSelect).toHaveBeenCalledWith(asset);
  expect(project.clips).toEqual([]);
  expect(container.textContent).not.toContain(translate('videoEditor.app.materialsAppend'));
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
