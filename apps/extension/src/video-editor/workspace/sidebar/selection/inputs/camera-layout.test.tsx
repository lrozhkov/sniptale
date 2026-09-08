// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraLayoutControls } from './camera-layout';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../../../features/video/project/types';
import {
  VideoProjectCameraLayout,
  resolveVideoProjectCameraPlacement,
} from '../../../../../features/video/project/camera/placement';

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
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
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

function button(suffix: string) {
  const element = container.querySelector<HTMLButtonElement>(
    `[data-ui="video-editor.camera-${suffix}"]`
  );
  if (!element) throw new Error(`Missing camera control ${suffix}`);
  return element;
}

describe('camera interval controls', () => {
  it('restores a hidden camera through the full-frame preset', () => {
    const props = createProps();
    props.clip.transform.opacity = 0;
    act(() => root.render(<CameraLayoutControls {...props} />));
    expect(button('layout-hidden').getAttribute('aria-pressed')).toBe('true');
    act(() => button('layout-fullframe').click());
    expect(props.onApplyCameraLayout).toHaveBeenCalledWith(
      props.clip.id,
      VideoProjectCameraLayout.FULLFRAME
    );
    expect(props.clip.transform.opacity).toBe(0);
    expect(button('layout-hidden').getAttribute('aria-pressed')).toBe('true');
  });

  it('targets the camera for placement and adding a position with accessible corner names', () => {
    const props = createProps();
    act(() => root.render(<CameraLayoutControls {...props} />));
    expect(button('placement-top_left').getAttribute('aria-label')).toBe(
      'videoEditor.sidebar.cameraPlacementTopLeft'
    );
    act(() => button('placement-top_left').click());
    expect(props.onApplyCameraLayout).toHaveBeenCalledWith(props.clip.id, 'OVERLAY', 'TOP_LEFT');
    act(() => button('add-position').click());
    expect(props.onEditCameraPosition).toHaveBeenCalledWith(props.clip.id, { kind: 'add' });
  });

  it('blocks duplicate positions and all edits on a locked camera', () => {
    const props = createProps();
    act(() => root.render(<CameraLayoutControls {...props} canAddCameraPosition={false} />));
    expect(button('add-position').disabled).toBe(true);
    expect(button('layout-fullframe').disabled).toBe(false);
    act(() => root.render(<CameraLayoutControls {...props} disabled />));
    expect(Array.from(container.querySelectorAll('button')).every((item) => item.disabled)).toBe(
      true
    );
    act(() => {
      button('layout-fullframe').click();
      button('add-position').click();
    });
    expect(props.onApplyCameraLayout).not.toHaveBeenCalled();
    expect(props.onEditCameraPosition).not.toHaveBeenCalled();
  });
});

it('reveals custom fitting only on demand and closes it after choosing a corner', () => {
  const props = createProps();
  props.clip.transform = {
    x: 1313.6,
    y: 701.2,
    width: 460.8,
    height: 345.6,
    rotation: 0,
    opacity: 1,
  };
  const render = () =>
    root.render(
      <CameraLayoutControls {...props} customControls={<span>Custom fitting controls</span>} />
    );
  // Use the same source-aspect corner preset as the production geometry owner.
  const expected = resolveVideoProjectCameraPlacement({
    placement: 'BOTTOM_RIGHT',
    projectWidth: props.project.width,
    projectHeight: props.project.height,
    sourceWidth: 640,
    sourceHeight: 480,
  });
  props.clip.transform = { ...props.clip.transform, ...expected };
  act(render);
  expect(container.textContent).not.toContain('Custom fitting controls');
  act(() => button('layout-custom').click());
  expect(container.textContent).toContain('Custom fitting controls');
  expect(button('placement-bottom_right').getAttribute('aria-pressed')).toBe('false');
  act(() => button('placement-top_left').click());
  expect(container.textContent).not.toContain('Custom fitting controls');
  expect(props.onApplyCameraLayout).toHaveBeenLastCalledWith(props.clip.id, 'OVERLAY', 'TOP_LEFT');
});
