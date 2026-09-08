// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CameraAppearanceControls } from './camera-appearance';
import { DEFAULT_CAMERA_APPEARANCE } from '../../../../../features/video/project/camera/appearance';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../../../features/video/project/types';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function createProps() {
  const project = createEmptyVideoProject('Camera');
  const asset = createVideoProjectAsset(
    'Camera',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'camera' },
    {
      width: 640,
      height: 480,
      duration: 6,
      mimeType: 'video/mp4',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset('camera-track', asset, project.width, project.height, 0);
  if (clip.type !== 'VIDEO') throw new Error('Expected camera video fixture');
  project.assets = [asset];
  project.clips = [clip];
  return {
    project,
    clip,
    disabled: false,
    canAddCameraPosition: true,
    onApplyCameraLayout: vi.fn(),
    onEditCameraPosition: vi.fn(),
  };
}

it('changes shape, roundness, crop zoom and centering through the camera edit port', async () => {
  const base = createProps();
  const onEdit = vi.fn();
  const clip = { ...base.clip, cameraAppearance: { ...DEFAULT_CAMERA_APPEARANCE, panX: 0.5 } };
  act(() =>
    root.render(
      <CameraAppearanceControls clip={clip} currentTime={0} disabled={false} onEdit={onEdit} />
    )
  );
  const shape = container.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.sidebar.cameraShape"]'
  )!;
  act(() => shape.click());
  const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
    (item) => item.textContent?.includes('cameraShapeEllipse')
  )!;
  await act(async () => {
    option.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await Promise.resolve();
  });
  expect(onEdit).toHaveBeenLastCalledWith(clip.id, {
    kind: 'appearance',
    appearance: { ...clip.cameraAppearance, shape: 'ellipse' },
  });
  function number(label: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(
      `input[aria-label="videoEditor.sidebar.${label}"]`
    )!;
    act(() => {
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
  }
  number('cameraRoundness', '40');
  expect(onEdit).toHaveBeenLastCalledWith(clip.id, {
    kind: 'appearance',
    appearance: { ...clip.cameraAppearance, roundness: 40 },
  });
  number('cameraCropZoom', '200');
  expect(onEdit).toHaveBeenLastCalledWith(clip.id, {
    kind: 'appearance',
    appearance: { ...clip.cameraAppearance, zoom: 2 },
  });
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="videoEditor.sidebar.cameraCropCenter"]')!
      .click()
  );
  expect(onEdit).toHaveBeenLastCalledWith(clip.id, {
    kind: 'appearance',
    appearance: { ...clip.cameraAppearance, panX: 0, panY: 0 },
  });
  act(() =>
    root.render(
      <CameraAppearanceControls
        clip={{ ...clip, cameraAppearance: { ...clip.cameraAppearance, shape: 'ellipse' } }}
        currentTime={0}
        disabled
        onEdit={onEdit}
      />
    )
  );
  expect(
    container.querySelector('input[aria-label="videoEditor.sidebar.cameraRoundness"]')
  ).toBeNull();
  expect(shape.disabled).toBe(true);
});
