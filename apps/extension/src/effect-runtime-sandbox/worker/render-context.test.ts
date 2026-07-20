import { expect, it, vi } from 'vitest';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
  type EffectRuntimeWorkerRequest,
} from '../../contracts/effect-runtime/types';
import { createDocument } from './interpreter/support.test-support';
import { createEffectRuntimeRenderContext } from './render-context';

class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

it('projects the validated worker request into the complete runtime context', () => {
  const request = createRequest();
  const source = new FakeBitmap(10, 10);
  request.document.kind = 'targetEffect';
  request.document.scenes = [{ duration: 1, id: 'main', start: 0.5 }];
  request.document.layers = [{ id: 'card', type: 'customDraw' }];
  request.document.clips = [{ duration: 1, layerId: 'card', start: 0.5 }];
  request.document.timeline.phases = [{ duration: 1, id: 'phase', start: 0.5 }];
  request.inputFrames = { source: { bitmap: source, height: 10, width: 10 } };
  request.time = 0.75;
  request.progress = 0.375;

  const context = createEffectRuntimeRenderContext(request, vi.fn());

  expect(context).toMatchObject({
    durationInFrames: 60,
    effectId: 'safe-graph',
    inputFrames: { source },
    kind: 'effect',
    sceneProgress: 0.25,
    sceneTime: 0.25,
  });
  expect(context.isLayerActive('card')).toBe(true);
  expect(context.phaseProgress('phase')).toBe(0.25);
  expect(context.resolveLayer('card')).toMatchObject({ active: true });
  expect(context.resolveTrack('missing', 4)).toBe(4);
  expect(context.track('missing', 5, 0)).toBe(5);
});

it('uses composition ownership and clamps scene progress outside its window', () => {
  const request = createRequest();
  request.time = 2;
  request.progress = 1;

  const context = createEffectRuntimeRenderContext(request, vi.fn());

  expect(context.kind).toBe('composition');
  expect(context.sceneProgress).toBe(1);
  expect(context.sceneTime).toBe(2);
});

function createRequest(): EffectRuntimeWorkerRequest {
  return {
    assets: {},
    assetSelectionId: 'b'.repeat(64),
    controls: {},
    document: createDocument([]),
    documentId: 'a'.repeat(64),
    duration: 2,
    effectInstanceId: 'instance',
    fps: 30,
    frameIndex: 30,
    height: 10,
    inputFrames: {},
    progress: 0.5,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    renderHeight: 10,
    renderWidth: 10,
    requestId: 'request',
    sequenceId: 1,
    snapshotId: 'snapshot',
    time: 1,
    type: EFFECT_RUNTIME_WORKER_REQUEST,
    width: 10,
  };
}
