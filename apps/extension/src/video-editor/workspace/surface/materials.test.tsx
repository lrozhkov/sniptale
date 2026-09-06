// @vitest-environment jsdom
import { act } from 'react';
import { useActiveCanvasInsertEscape } from '@sniptale/ui/canvas-tools';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { VideoEditorMaterials } from './materials';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import { translate } from '../../../platform/i18n';

const container = document.createElement('div');
let root = createRoot(container);
afterEach(() => {
  act(() => root.unmount());
  root = createRoot(container);
  container.remove();
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
