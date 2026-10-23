import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { disposeEffectRuntimeComposition } from '../../../features/video/composition/effect-runtime';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { VideoProject } from '../../../features/video/project/types';
import {
  createOffscreenProjectEffectRuntime,
  renderOffscreenProjectEffectFrames,
  type RenderOffscreenProjectEffectFramesInput,
} from './index';

const mocks = vi.hoisted(() => ({
  createExecutor: vi.fn(),
  dispose: vi.fn(),
  renderComposition: vi.fn(),
  resolveRenderPasses: vi.fn(),
}));

vi.mock('../../../features/video/composition/effect-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/composition/effect-runtime')>()),
  renderEffectRuntimeComposition: mocks.renderComposition,
}));

vi.mock('../../../features/video/composition/timeline/render', () => ({
  resolveVideoCompositionRenderPasses: mocks.resolveRenderPasses,
}));

vi.mock('../../../workflows/video/effect-runtime-sandbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/video/effect-runtime-sandbox')>()),
  createEffectRuntimeSandboxExecutor: mocks.createExecutor,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createExecutor.mockReturnValue({ dispose: mocks.dispose, execute: vi.fn() });
  mocks.renderComposition.mockResolvedValue({ framesByTime: new Map(), overlayFrames: new Map() });
  mocks.resolveRenderPasses.mockReturnValue(createRenderPasses(false, false));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('offscreen EffectV1 runtime lifecycle', () => {
  it('does not create a sandbox without enabled instances or render plans', async () => {
    const runtime = createOffscreenProjectEffectRuntime();

    await expect(
      runtime.renderProjectFrames(createRenderArgs(createProject(false)))
    ).resolves.toBeUndefined();
    await expect(
      runtime.renderProjectFrames(createRenderArgs(createProject(true)))
    ).resolves.toBeUndefined();
    expect(mocks.createExecutor).not.toHaveBeenCalled();
    runtime.dispose();
    expect(mocks.dispose).not.toHaveBeenCalled();
  });

  it('lazily reuses one sandbox and disposes it exactly once', async () => {
    mocks.resolveRenderPasses.mockReturnValue(createRenderPasses(true, false));
    const runtime = createOffscreenProjectEffectRuntime();
    const args = createRenderArgs(createProject(true));

    await expect(runtime.renderProjectFrames(args)).resolves.toEqual(
      expect.objectContaining({ overlayFrames: expect.any(Map) })
    );
    await runtime.renderProjectFrames(args);
    expect(mocks.createExecutor).toHaveBeenCalledOnce();
    expect(mocks.renderComposition).toHaveBeenCalledTimes(2);
    runtime.dispose();
    runtime.dispose();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it('keeps the one-shot executor alive until its streamed composition is disposed', async () => {
    mocks.resolveRenderPasses.mockReturnValue(createRenderPasses(false, true));

    const frames = await renderOffscreenProjectEffectFrames(createRenderArgs(createProject(true)));
    expect(frames).toEqual(expect.objectContaining({ framesByTime: expect.any(Map) }));
    expect(mocks.dispose).not.toHaveBeenCalled();
    disposeEffectRuntimeComposition(frames);
    disposeEffectRuntimeComposition(frames);
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });
});

describe('offscreen EffectV1 runtime authority forwarding', () => {
  it('forwards composition indexes and the narrowest owner document', async () => {
    vi.stubGlobal('Document', class DocumentMock {});
    const fallbackDocument = new Document();
    const requestDocument = new Document();
    const spatialRenderer = vi.fn(() => ({
      validateSizes: vi.fn(),
      surface: vi.fn(),
      draw: vi.fn(),
      dispose: vi.fn(),
    }));
    const compositionIndex = { clipsByTrackId: new Map(), tracksInRenderOrder: [] };
    mocks.resolveRenderPasses.mockReturnValue(createRenderPasses(true, false));
    const runtime = createOffscreenProjectEffectRuntime({ ownerDocument: fallbackDocument });

    await runtime.renderProjectFrames({
      ...createRenderArgs(createProject(true)),
      compositionIndex,
      ownerDocument: requestDocument,
      spatialRenderer,
    });

    expect(mocks.resolveRenderPasses).toHaveBeenCalledWith(expect.anything(), 1, {
      timelineIndex: compositionIndex,
    });
    expect(mocks.createExecutor).toHaveBeenCalledWith({ ownerDocument: requestDocument });
    expect(mocks.renderComposition).toHaveBeenCalledWith(
      expect.objectContaining({ ownerDocument: requestDocument, spatialRenderer })
    );
    expect(spatialRenderer).not.toHaveBeenCalled();
    runtime.dispose();

    await renderOffscreenProjectEffectFrames({
      ...createRenderArgs(createProject(true)),
      ownerDocument: fallbackDocument,
    });
    expect(mocks.createExecutor).toHaveBeenLastCalledWith({ ownerDocument: fallbackDocument });
  });
});

function createProject(enabled: boolean): VideoProject {
  return {
    ...createEmptyVideoProject('offscreen-effects'),
    effectInstances: [
      {
        controls: {},
        duration: 1,
        enabled,
        id: 'instance',
        kind: 'standalone',
        playbackRate: 1,
        snapshotId: 'effect:snapshot',
        startTime: 0,
        target: { kind: 'scene' },
      },
    ],
  };
}

function createRenderArgs(project: VideoProject): RenderOffscreenProjectEffectFramesInput {
  return {
    clipMediaElements: new Map(),
    currentTime: 1,
    loadedImages: {},
    project,
  };
}

function createRenderPasses(overlayPlan: boolean, visualPlan: boolean) {
  return {
    overlayFrame: overlayPlan ? { effectRuntimePlans: [{}] } : {},
    visualPasses: [
      {
        frame: visualPlan ? { effectRuntimePlans: [{}] } : {},
        time: 1,
      },
    ],
  };
}

it.each(['empty', 'refused'] as const)(
  'cleans up one-shot preparation when frames are %s',
  async (mode) => {
    mocks.resolveRenderPasses.mockReturnValue(createRenderPasses(mode === 'refused', false));
    if (mode === 'refused') {
      mocks.renderComposition.mockRejectedValueOnce(new Error('Raster preparation refused'));
      await expect(
        renderOffscreenProjectEffectFrames(createRenderArgs(createProject(true)))
      ).rejects.toThrow('Raster preparation refused');
      expect(mocks.dispose).toHaveBeenCalledOnce();
    } else {
      await expect(
        renderOffscreenProjectEffectFrames(createRenderArgs(createProject(true)))
      ).resolves.toBeUndefined();
      expect(mocks.createExecutor).not.toHaveBeenCalled();
      expect(mocks.dispose).not.toHaveBeenCalled();
    }
  }
);
