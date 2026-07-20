import { vi } from 'vitest';

import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';
import { createEffectRuntimeAssetSelectionId } from '../../contracts/effect-runtime/immutable-refs';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  type EffectRuntimeRenderMessage,
} from '../../contracts/effect-runtime/types';

export class FakeImageBitmap implements ImageBitmap {
  readonly close = vi.fn();

  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

export async function createEffectRuntimeRenderMessage(
  kind: 'standalone' | 'targetEffect' | 'transition',
  assetBytes?: Uint8Array
): Promise<EffectRuntimeRenderMessage> {
  const assets = assetBytes
    ? [
        {
          byteLength: assetBytes.byteLength,
          dataUrl: `data:image/png;base64,${toBase64(assetBytes)}`,
          height: 1,
          id: 'texture',
          kind: 'image' as const,
          mimeType: 'image/png',
          sha256: await sha256EffectV1Bytes(assetBytes),
          width: 1,
        },
      ]
    : [];
  const documentSource = JSON.stringify({
    assets,
    clips: [],
    controls: [],
    duration: 2,
    id: 'safe-effect',
    kind,
    label: { en: 'Safe effect', ru: 'Безопасный эффект' },
    layers: [],
    program: { commands: createCommands(kind), kind: 'graph', version: 1 },
    scenes: [{ duration: 2, id: 'main', start: 0 }],
    schemaVersion: 'sniptale.effect.v1',
    timeline: { phases: [], tracks: [] },
  });
  const documentSha256 = await sha256EffectV1Bytes(new TextEncoder().encode(documentSource));
  const assetSelectionId = await createEffectRuntimeAssetSelectionId(
    assets.map(({ id, sha256 }) => ({ id, sha256 }))
  );
  return createRuntimeMessage(
    documentSource,
    documentSha256,
    assetSelectionId,
    assetBytes,
    assets[0]?.sha256
  );
}

function createRuntimeMessage(
  documentSource: string,
  documentSha256: string,
  assetSelectionId: string,
  assetBytes?: Uint8Array,
  assetSha256?: string
): EffectRuntimeRenderMessage {
  return {
    assetSelectionRef: {
      assets: assetBytes
        ? [
            {
              byteLength: assetBytes.byteLength,
              bytes: assetBytes.slice().buffer,
              id: 'texture',
              kind: 'image',
              mimeType: 'image/png',
              sha256: assetSha256!,
            },
          ]
        : [],
      id: assetSelectionId,
    },
    controls: {},
    documentRef: { id: documentSha256, source: documentSource },
    duration: 2,
    effectInstanceId: 'instance-1',
    fps: 30,
    frameIndex: 15,
    height: 720,
    inputFrames: {},
    kind: 'renderFrame',
    progress: 0.25,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    renderHeight: 720,
    renderWidth: 1280,
    requestId: 'request-1',
    sequenceId: 1,
    snapshotId: `effect:${documentSha256}`,
    time: 0.5,
    width: 1280,
  };
}

function createCommands(kind: 'standalone' | 'targetEffect' | 'transition') {
  if (kind === 'standalone') return [{ color: '#000', op: 'clear' }];
  const inputs = kind === 'targetEffect' ? ['source'] : ['from', 'to'];
  return inputs.map((input, index) => ({
    height: 720,
    input,
    op: 'image',
    width: 1280,
    x: 0,
    y: index * 2,
  }));
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
