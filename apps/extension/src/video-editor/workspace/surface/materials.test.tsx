import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
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

const onOpenLibrary = vi.fn();
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
  const onRemoveUnused = vi.fn();
  const onImport = { audio: vi.fn(), image: vi.fn(), video: vi.fn() };
  act(() =>
    root.render(
      <VideoEditorMaterials
        onRemoveUnused={onRemoveUnused}
        onOpenLibrary={onOpenLibrary}
        project={project}
        selectedAssetId={null}
        onSelect={onSelect}
        onImport={onImport}
      />
    )
  );
  return { asset, onSelect, onImport, project, onRemoveUnused };
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
