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
      <CameraAppearanceControls
        project={base.project}
        clip={clip}
        currentTime={0}
        disabled={false}
        onEdit={onEdit}
      />
    )
  );
  const option = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((item) =>
    item.textContent?.includes('cameraShapeEllipse')
  )!;
  expect(option.getAttribute('aria-pressed')).toBe('false');
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
    kind: 'crop',
    crop: { zoom: 2, panX: 0.5, panY: 0 },
  });
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="videoEditor.sidebar.cameraCropCenter"]')!
      .click()
  );
  expect(onEdit).toHaveBeenLastCalledWith(clip.id, {
    kind: 'crop',
    crop: { zoom: 1, panX: 0, panY: 0 },
  });
  act(() =>
    root.render(
      <CameraAppearanceControls
        project={base.project}
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
  const shapeChoices = [...container.querySelectorAll<HTMLButtonElement>('[aria-pressed]')];
  expect(shapeChoices).toHaveLength(6);
  expect(shapeChoices.every((button) => button.disabled)).toBe(true);
  expect(
    shapeChoices
      .find((button) => button.textContent?.includes('cameraShapeEllipse'))
      ?.getAttribute('aria-pressed')
  ).toBe('true');
});

it('commits reflection through the camera command and disables it on locked clips', async () => {
  const base = createProps();
  const onEdit = vi.fn();
  const render = (disabled: boolean, cameraMirrored = false) =>
    act(() =>
      root.render(
        <CameraAppearanceControls
          project={base.project}
          clip={{ ...base.clip, cameraMirrored }}
          currentTime={0}
          disabled={disabled}
          onEdit={onEdit}
        />
      )
    );
  render(false);
  const horizontal = () =>
    [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('webcamMirrorOn')
    )!;
  await act(async () =>
    horizontal().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  );
  expect(onEdit).toHaveBeenCalledWith(base.clip.id, { kind: 'mirror', mirrored: true });
  render(true, true);
  expect(horizontal().getAttribute('aria-pressed')).toBe('true');
  expect(horizontal().disabled).toBe(true);
});

it('offers circle with one diameter and retains the authored frame ratio and dormant roundness', () => {
  const base = createProps();
  const clip = {
    ...base.clip,
    transform: { ...base.clip.transform, width: 200, height: 100 },
    cameraAppearance: { ...DEFAULT_CAMERA_APPEARANCE, roundness: 61 },
  };
  const onEdit = vi.fn(),
    onUpdateClipTransform = vi.fn();
  act(() =>
    root.render(
      <CameraAppearanceControls
        project={base.project}
        clip={clip}
        currentTime={0}
        disabled={false}
        onEdit={onEdit}
        onUpdateClipTransform={onUpdateClipTransform}
      />
    )
  );
  const circle = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'gallery.videoReview.webcamCircle'
  )!;
  act(() => circle.click());
  expect(onEdit).toHaveBeenCalledExactlyOnceWith(clip.id, {
    kind: 'appearance',
    appearance: { ...clip.cameraAppearance, shape: 'circle' },
  });
  const circleClip = {
    ...clip,
    cameraAppearance: { ...clip.cameraAppearance, shape: 'circle' as const },
  };
  act(() =>
    root.render(
      <CameraAppearanceControls
        project={base.project}
        clip={circleClip}
        currentTime={0}
        disabled={false}
        onEdit={onEdit}
        onUpdateClipTransform={onUpdateClipTransform}
      />
    )
  );
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="gallery.videoReview.webcamDiameter"]'
  )!;
  expect(input.value).toBe('100');
  expect(container.querySelector('input[aria-label="videoEditor.sidebar.widthLabel"]')).toBeNull();
  expect(container.querySelector('input[aria-label="videoEditor.sidebar.heightLabel"]')).toBeNull();
  expect(
    container.querySelector('input[aria-label="videoEditor.sidebar.cameraRoundness"]')
  ).toBeNull();
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '150');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(onUpdateClipTransform).toHaveBeenCalledWith(clip.id, { width: 300, height: 150 });
  expect(circleClip.transform).toEqual(clip.transform);
  act(() =>
    root.render(
      <CameraAppearanceControls
        project={base.project}
        clip={clip}
        currentTime={0}
        disabled={false}
        onEdit={onEdit}
      />
    )
  );
  expect(
    container.querySelector<HTMLInputElement>(
      'input[aria-label="videoEditor.sidebar.cameraRoundness"]'
    )?.value
  ).toBe('61');
  expect(
    container.querySelector('input[aria-label="gallery.videoReview.webcamDiameter"]')
  ).toBeNull();
});

it('shows destination framing and resets its override without copying crop into shape edits', () => {
  const { project, clip } = createProps();
  clip.cameraAppearance = { ...DEFAULT_CAMERA_APPEARANCE, zoom: 1.25, shape: 'circle' };
  clip.cameraPositions = [
    {
      id: 'destination',
      sourceTime: 2,
      transform: { ...clip.transform },
      fitMode: clip.fitMode,
      transition: { kind: 'smooth', duration: 1 },
      crop: { zoom: 2, panX: 0.4, panY: -0.2 },
    },
  ];
  const onEdit = vi.fn();
  const render = (disabled = false) =>
    act(() =>
      root.render(
        <CameraAppearanceControls
          project={project}
          clip={clip}
          currentTime={3}
          disabled={disabled}
          onEdit={onEdit}
        />
      )
    );
  render();
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="videoEditor.sidebar.cameraCropZoom"]'
  )!;
  expect(input.value).toBe('200');
  const video = container.querySelector<HTMLVideoElement>('video')!;
  act(() => video.dispatchEvent(new Event('loadedmetadata')));
  expect(video.currentTime).toBe(3);
  Object.assign(clip.cameraPositions[0]!.crop!, { shape: 'ellipse', roundness: 90 });
  render();
  expect(
    container.querySelector<HTMLInputElement>(
      'input[aria-label="gallery.videoReview.webcamDiameter"]'
    )
  ).not.toBeNull();
  const shape = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('cameraShapeEllipse')
  )!;
  act(() => shape.click());
  expect(onEdit).toHaveBeenLastCalledWith(clip.id, {
    kind: 'appearance',
    appearance: { ...clip.cameraAppearance, shape: 'ellipse' },
  });
  const reset = container.querySelector<HTMLButtonElement>(
    'button[aria-label="videoEditor.sidebar.cameraCropResetPosition"]'
  )!;
  expect(reset.disabled).toBe(false);
  expect(reset.querySelector('svg')).not.toBeNull();
  act(() => reset.click());
  expect(onEdit).toHaveBeenLastCalledWith(clip.id, { kind: 'crop', crop: null });
  render(true);
  expect(reset.disabled).toBe(true);
  delete clip.cameraPositions[0]!.crop;
  render();
  expect(reset.disabled).toBe(true);
  expect(input.value).toBe('125');
});

it('previews the resolved rectangular split camera crop without rewriting the dormant dock', () => {
  const base = createProps();
  base.project.tracks = [
    {
      id: base.clip.trackId,
      name: 'Camera',
      kind: 'PRIMARY',
      role: 'CAMERA',
      order: 0,
      visible: true,
      locked: false,
    },
  ];
  base.clip.cameraSplit = 'left';
  base.clip.cameraScreenBehavior = 'shrink';
  base.clip.cameraAppearance = {
    ...DEFAULT_CAMERA_APPEARANCE,
    shape: 'circle',
    zoom: 2,
    panX: 0.3,
  };
  const dormant = structuredClone(base.clip.transform);
  act(() =>
    root.render(
      <CameraAppearanceControls
        project={base.project}
        clip={base.clip}
        currentTime={0}
        disabled={false}
        onEdit={vi.fn()}
      />
    )
  );
  const preview = container.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.sidebar.cameraCropPreview"]'
  )!;
  expect(preview.style.aspectRatio).toBe(`${base.project.width * 0.49} / ${base.project.height}`);
  expect(base.clip.transform).toEqual(dormant);
});

it('keeps the selected destination crop aperture while scrubbing inside a smooth dock-to-split transition', () => {
  const base = createProps();
  base.project.tracks = [
    {
      id: base.clip.trackId,
      name: 'Camera',
      kind: 'PRIMARY',
      role: 'CAMERA',
      order: 0,
      visible: true,
      locked: false,
    },
  ];
  base.clip.cameraAppearance = { ...DEFAULT_CAMERA_APPEARANCE, shape: 'circle' };
  base.clip.cameraPositions = [
    {
      id: 'panel',
      sourceTime: 2,
      cameraSplit: 'left',
      transform: { ...base.clip.transform },
      fitMode: base.clip.fitMode,
      crop: { zoom: 2, panX: 0.3, panY: -0.2 },
      transition: { kind: 'smooth', duration: 2 },
    },
  ];
  act(() =>
    root.render(
      <CameraAppearanceControls
        project={base.project}
        clip={base.clip}
        currentTime={2.5}
        disabled={false}
        onEdit={vi.fn()}
      />
    )
  );
  const preview = container.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.sidebar.cameraCropPreview"]'
  )!;
  expect(preview.style.aspectRatio).toBe(`${base.project.width * 0.49} / ${base.project.height}`);
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="videoEditor.sidebar.cameraCropZoom"]')!
      .value
  ).toBe('200');
  const video = container.querySelector<HTMLVideoElement>('video')!;
  act(() => video.dispatchEvent(new Event('loadedmetadata')));
  expect(video.currentTime).toBe(2.5);
});
