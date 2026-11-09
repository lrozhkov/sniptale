// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { usePreviewStageCanvasRender } from './render';
import { createPreviewEffectRuntimeFeedbackTestStub } from './test-support';
import type { PreviewStageCanvasSceneParams } from './types';
const enqueue = vi.hoisted(() => vi.fn((_job: unknown) => () => undefined));
vi.mock('./render-scheduler', async (original) => ({
  ...(await original<typeof import('./render-scheduler')>()),
  createPreviewSceneRenderScheduler: vi.fn(() => ({ enqueue, dispose: vi.fn() })),
}));
vi.mock('./render-preview', async (original) => ({
  ...(await original<typeof import('./render-preview')>()),
  renderPreviewScene: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../features/video/composition/canvas/spatial-renderer', () => ({
  createReviewSpatialRenderer: vi.fn(() => ({
    validateSizes: vi.fn(),
    surface: vi.fn(),
    draw: vi.fn(),
    dispose: vi.fn(),
  })),
}));
function DemandHarness({
  prepareImages,
}: {
  prepareImages: NonNullable<PreviewStageCanvasSceneParams['prepareImages']>;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  usePreviewStageCanvasRender({
    activeClips: [],
    canvasRef,
    stageRef,
    currentTime: 0,
    effectRuntimeFeedback: createPreviewEffectRuntimeFeedbackTestStub(),
    imageBank: {},
    isPlaying: true,
    project: createEmptyVideoProject('Scene', 200, 100),
    resizeVersion: 0,
    videoFrameState: { canRender: true, version: 0 },
    videoRefs: { current: {} },
    prepareImages,
  });
  return (
    <div ref={stageRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}
it('forwards the image demand callback to the actual scene scheduler job', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const prepareImages = vi.fn(async () => undefined);
  try {
    await act(async () => root.render(<DemandHarness prepareImages={prepareImages} />));
    expect(enqueue.mock.lastCall?.[0]).toMatchObject({ prepareImages });
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
