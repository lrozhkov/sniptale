// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { bindMotionRegionToClip } from '../../../../features/video/project/motion/source-binding';
import { getVideoClipSourceTime } from '../../../../features/video/project/timeline';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import type { PreviewSourceDemand } from '../../../../workflows/video/preview-source';
import { preparePreviewSourceFrames } from './source-frames';
import type { PreviewSceneRenderInput } from './types';
it.each([false, true])(
  'binds held source poses with explicit paused seek intent (playing=%s)',
  async (isPlaying) => {
    const clip = createVideoClip({
      id: 'source',
      duration: 5 / 3,
      sourceDuration: 0.15,
      playbackRate: 0.1,
      playbackWindow: { offset: 0, extent: 5 / 3, holdAt: 1.3 },
    });
    const project = createProject([clip]);
    project.motionRegions = [
      bindMotionRegionToClip(
        {
          ...createVideoProjectMotionRegion(project, 0),
          duration: 1.5,
          scale: 2,
          zoomInDuration: 1.5,
          motionBlurAmount: 1,
        },
        clip
      ),
    ];
    const passes = resolveVideoCompositionRenderPasses(project, 1.3);
    expect(passes.visualPasses.length).toBeGreaterThan(1);
    const acquired: PreviewSourceDemand[] = [];
    const identities = new WeakMap<object, number>();
    const release = vi.fn();
    const runtime = {
      selected: true,
      acquire: vi.fn(async (demands: readonly PreviewSourceDemand[]) => {
        acquired.push(...demands);
        return {
          bindings: new Map(
            demands.map((demand) => {
              const source = { sourceWidth: 1280, sourceHeight: 720, draw: vi.fn() };
              identities.set(source, demand.time);
              return [
                demand.id,
                {
                  source,
                  timestamp: demand.time,
                  nextTimestamp: demand.time + 0.01,
                  target: demand.time,
                  url: demand.url,
                },
              ];
            })
          ),
          release,
        };
      }),
    };
    const input: PreviewSceneRenderInput = {
      project,
      currentTime: 1.3,
      isPlaybackFrame: isPlaying,
      canvas: document.createElement('canvas'),
      stage: null,
      imageBank: {},
      videoRefs: { current: {} },
      sourceRuntime: runtime,
      assetUrls: { [clip.assetId]: 'blob:source' },
    };
    const resources = await preparePreviewSourceFrames(input, passes);
    if (!resources) throw new Error('Expected source leases');
    const targets = new Set<number>();
    let exposureMappingChanged = false;
    for (const pass of passes.visualPasses) {
      const layer = pass.frame.visualLayers.find((layer) => layer.kind === 'video');
      if (layer?.kind !== 'video') throw new Error('Expected source layer');
      const target = getVideoClipSourceTime(layer.clip, pass.time);
      targets.add(target);
      exposureMappingChanged ||= Math.abs(target - getVideoClipSourceTime(clip, pass.time)) > 1e-9;
      expect(identities.get(resources.media(pass.frame, pass.time).get(clip.id)!)).toBe(target);
      expect(resources.media(pass.frame, pass.time, [{ ...layer, actions: [] }]).get(clip.id)).toBe(
        resources.media(pass.frame, pass.time).get(clip.id)
      );
    }
    expect(targets.size).toBeGreaterThan(1);
    expect(exposureMappingChanged).toBe(true);
    expect(runtime.acquire).toHaveBeenCalledOnce();
    expect(runtime.acquire).toHaveBeenCalledWith(acquired, expect.any(AbortSignal), {
      discontinuity: !isPlaying,
    });
    expect(acquired.every((demand) => demand.url === 'blob:source')).toBe(true);
    resources.release();
    expect(release).toHaveBeenCalledOnce();
  }
);
it('releases a decoded lease when its job is aborted before the acquisition settles', async () => {
  const clip = createVideoClip();
  const project = createProject([clip]);
  const passes = resolveVideoCompositionRenderPasses(project, 1);
  const controller = new AbortController();
  const release = vi.fn();
  const gate = Promise.withResolvers<{ bindings: Map<string, never>; release: () => void }>();
  const input: PreviewSceneRenderInput = {
    project,
    currentTime: 1,
    canvas: document.createElement('canvas'),
    stage: null,
    imageBank: {},
    videoRefs: { current: {} },
    assetUrls: { [clip.assetId]: 'blob:source' },
    signal: controller.signal,
    sourceRuntime: {
      selected: true,
      acquire: vi.fn(() => gate.promise),
    },
  };
  const pending = preparePreviewSourceFrames(input, passes);
  controller.abort();
  gate.resolve({ bindings: new Map<string, never>(), release });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(release).toHaveBeenCalledOnce();
});
