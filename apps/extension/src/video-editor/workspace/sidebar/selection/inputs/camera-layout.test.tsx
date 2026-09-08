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
import { VideoProjectCameraLayout } from '../../../../../features/video/project/camera/placement';

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
  it('restores a hidden camera through the layout selector', () => {
    const props = createProps();
    props.clip.transform.opacity = 0;
    act(() => root.render(<CameraLayoutControls {...props} />));
    expect(layoutButton().textContent).toContain('videoEditor.sidebar.cameraLayoutHidden');
    chooseLayout('videoEditor.sidebar.cameraLayoutFullframe');
    expect(props.onApplyCameraLayout).toHaveBeenCalledWith(
      props.clip.id,
      VideoProjectCameraLayout.FULLFRAME
    );
    expect(props.clip.transform.opacity).toBe(0);
    expect(layoutButton().textContent).toContain('videoEditor.sidebar.cameraLayoutHidden');
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
    expect(layoutButton().disabled).toBe(false);
    act(() => root.render(<CameraLayoutControls {...props} disabled />));
    expect(Array.from(container.querySelectorAll('button')).every((item) => item.disabled)).toBe(
      true
    );
    act(() => {
      layoutButton().click();
      button('add-position').click();
    });
    expect(props.onApplyCameraLayout).not.toHaveBeenCalled();
    expect(props.onEditCameraPosition).not.toHaveBeenCalled();
  });
});

function layoutButton() {
  return container.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.sidebar.cameraLayoutLabel"]'
  )!;
}
function chooseLayout(label: string) {
  act(() => layoutButton().click());
  const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
    (item) => item.textContent?.includes(label)
  );
  expect(option).toBeDefined();
  act(() => option!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
}
