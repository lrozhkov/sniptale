import { vi } from 'vitest';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
  type EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';
import { createPassContext } from './interpreter/support.test-support';

export class FakeImageBitmap implements ImageBitmap {
  readonly close = vi.fn();

  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

export class FakeOffscreenCanvas {
  readonly context = createPassContext();

  constructor(
    readonly width: number,
    readonly height: number
  ) {}

  getContext() {
    return this.context;
  }

  transferToImageBitmap(): ImageBitmap {
    return new FakeImageBitmap(this.width, this.height);
  }
}

export function createEffectRuntimeWorkerTestRequest(): EffectRuntimeWorkerMessage {
  return {
    assetSelectionRef: { assets: {}, id: 'd'.repeat(64) },
    controls: {},
    documentRef: {
      document: {
        assets: [],
        clips: [],
        controls: [],
        duration: 2,
        id: 'safe-effect',
        kind: 'standalone',
        label: { en: 'Safe effect', ru: 'Безопасный эффект' },
        layers: [],
        program: {
          commands: [{ color: '#101820', op: 'clear' }],
          kind: 'graph',
          version: 1,
        },
        scenes: [{ duration: 2, id: 'main', start: 0 }],
        schemaVersion: 'sniptale.effect.v1',
        timeline: { phases: [], tracks: [] },
      },
      id: 'c'.repeat(64),
    },
    duration: 2,
    effectInstanceId: 'instance-1',
    fps: 30,
    frameIndex: 15,
    height: 720,
    inputFrames: {},
    progress: 0.25,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    renderHeight: 720,
    renderWidth: 1280,
    requestId: 'request-1',
    sequenceId: 1,
    snapshotId: `effect:${'c'.repeat(64)}`,
    time: 0.5,
    type: EFFECT_RUNTIME_WORKER_REQUEST,
    width: 1280,
  };
}

export function createEffectRuntimeSvgWorkerTestRequest(): EffectRuntimeWorkerMessage {
  const request = createEffectRuntimeWorkerTestRequest();
  request.documentRef.document!.assets = [
    {
      byteLength: 1,
      id: 'logo',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      path: 'runtime-assets/logo',
      sha256: 'a'.repeat(64),
    },
  ];
  request.documentRef.document!.program.commands = [
    { assetId: 'logo', height: 10, op: 'svgParts', width: 10, x: 0, y: 0 },
  ];
  request.assetSelectionRef.assets = {
    logo: {
      cacheKey: 'a'.repeat(64),
      height: 10,
      id: 'logo',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      svgVector: {
        height: 10,
        parts: [
          {
            cx: 5,
            cy: 5,
            fill: '#fff',
            groupId: null,
            groupIds: [],
            id: 'path',
            opacity: 1,
            pathData: 'M0 0L10 10',
            stroke: null,
            strokeLineCap: 'butt',
            strokeLineJoin: 'miter',
            strokeWidth: 0,
            type: 'path',
          },
        ],
        width: 10,
      },
      width: 10,
    },
  };
  return request;
}
