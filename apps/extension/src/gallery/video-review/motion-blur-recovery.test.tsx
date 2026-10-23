// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewMotionBlurPreview } from './motion-blur-preview';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { DEFAULT_CAMERA_PERSPECTIVE as DEFAULT_QUICK_EDIT_PERSPECTIVE } from '../../features/video/project/motion/spatial';
import {
  computeQuickEditSceneLayout,
  evaluateQuickEditCameraAtTime,
} from '../../features/video/review/advanced/scene';
import { quickEditMotionBlurCameras } from '../../features/video/review/advanced/motion-blur';
import { drawReviewSceneFrame } from '../../workflows/video-review/scene-frame';
vi.mock('../../features/video/composition/canvas/spatial-renderer', () => ({
  createReviewSpatialRenderer: () => {
    throw new Error('GPU unavailable');
  },
}));
vi.mock('../../workflows/video-review/scene-frame', () => ({ drawReviewSceneFrame: vi.fn() }));

it('recovers from spatial failure while ordinary temporal exposure keeps the same canvas mounted', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const source = document.createElement('canvas');
  const render = (enabled: boolean) => {
    const region = {
      ...createQuickEditZoomRegion({ id: 'blur', at: 0 }),
      perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled, rotateY: 35 },
      motionBlur: { enter: { enabled: true, strength: 1 } },
    };
    const camera = evaluateQuickEditCameraAtTime([region], 0.1);
    expect(quickEditMotionBlurCameras([region], 0.1).length).toBeGreaterThan(1);
    const output = { width: 800, height: 450 };
    const background = {
      enabled: true as const,
      type: 'solid' as const,
      color: '#000000ff',
      layout: { padding: 0, cornerRadius: 0, blur: 12 },
    };
    const layout = computeQuickEditSceneLayout({ output, source: output, background, camera });
    act(() =>
      root.render(
        <ReviewMotionBlurPreview
          focus={{ regions: [region], time: 0.1 }}
          camera={camera}
          output={output}
          layout={layout}
          background={background}
          sceneScale={0.5}
          getFrame={() => source}
        />
      )
    );
  };
  try {
    render(true);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    const canvas = host.querySelector('canvas');
    render(false);
    expect(host.querySelector('canvas')).toBe(canvas);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    const painted = vi.mocked(drawReviewSceneFrame).mock.calls.at(-1)![1].background;
    expect(painted.enabled && painted.layout.blur).toBe(6);
    expect(
      vi.mocked(drawReviewSceneFrame).mock.calls.at(-1)![1].motionBlur!.length
    ).toBeGreaterThan(1);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
