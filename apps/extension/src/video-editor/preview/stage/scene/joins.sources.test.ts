// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionFrame } from '../../../../features/video/composition/timeline/frame';
import { createVideoPreviewCompositionJoinRenderer } from './joins';
import type { PreviewSceneRenderInput } from './types';
const materializer = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../cache/materializer', () => ({
  createVideoPreviewFrameMaterializer: materializer.create,
}));
it('keeps retained windows on their existing materialized endpoint owner during precise takeover', async () => {
  const clip = createVideoClip({
    id: 'held',
    duration: 2,
    playbackWindow: { offset: 0, extent: 2, holdAt: 1 },
  });
  const project = createProject([clip]);
  const canvas = document.createElement('canvas');
  Object.defineProperties(canvas, { clientWidth: { value: 16 }, clientHeight: { value: 8 } });
  const sampled = document.createElement('canvas');
  sampled.width = 16;
  sampled.height = 8;
  const sample = vi.fn(async (time: number) => ({
    canvas: sampled,
    presentation: { camera: resolveVideoCompositionFrame(project, time).camera, time },
  }));
  const dispose = vi.fn();
  materializer.create.mockReturnValue({
    canvas: sampled,
    renderFrameWithPresentation: sample,
    renderFrame: vi.fn(),
    updateProject: vi.fn(() => true),
    dispose,
  });
  const acquire = vi.fn(async () => null);
  const raw = vi.fn(async () => undefined);
  const prepare = vi.fn(async (input: PreviewSceneRenderInput) => ({ input, release: vi.fn() }));
  const owner = createVideoPreviewCompositionJoinRenderer(raw, prepare);
  const input: PreviewSceneRenderInput = {
    project,
    currentTime: 1.5,
    canvas,
    stage: null,
    imageBank: {},
    videoRefs: { current: {} },
    assetUrls: { [clip.assetId]: 'blob:source' },
    sourceRuntime: { selected: true, acquire },
  };
  const admission = await owner.prepare(input);
  expect(admission?.input).toBe(input);
  expect(admission?.input.preparedFrame).toBeUndefined();
  await owner.render(input);
  expect(prepare).not.toHaveBeenCalled();
  expect(acquire).not.toHaveBeenCalled();
  expect(raw).not.toHaveBeenCalled();
  expect(sample.mock.calls[0]?.[0]).toBe(1.5);
  admission?.release();
  owner.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});
