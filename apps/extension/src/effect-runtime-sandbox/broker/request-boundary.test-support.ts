import { vi } from 'vitest';
import { parseRuntimeAnimationDocument } from '../../contracts/effect-runtime/animation';
import { createEffectRuntimeAssetSelectionId } from '../../contracts/effect-runtime/immutable-refs';
import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  type EffectRuntimeRenderMessage,
} from '../../contracts/effect-runtime/types';
import type { AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';

export class FakeImageBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

export function createAnimationDocument(width = 1280, height = 720): AnimationTemplate {
  const document = parseRuntimeAnimationDocument({
    format: 'sniptale-animation',
    version: 1,
    id: 'safe-effect',
    label: { en: 'Safe effect' },
    controls: [],
    bindings: [],
    resources: [],
    animation: { v: '5.12.2', w: width, h: height, fr: 30, ip: 30, op: 90, layers: [], assets: [] },
  });
  if (!document) throw new Error('Invalid animation fixture.');
  return document;
}

export async function sourceDigest(source: string): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))),
    (value) => value.toString(16).padStart(2, '0')
  ).join('');
}

export async function createEffectRuntimeRenderMessage(
  document = createAnimationDocument()
): Promise<EffectRuntimeRenderMessage> {
  const source = JSON.stringify(document),
    id = await sourceDigest(source);
  return {
    assetSelectionRef: {
      assets: [],
      id: await createEffectRuntimeAssetSelectionId(
        document.resources.map(({ path, sha256 }) => ({ id: path, sha256 }))
      ),
    },
    controls: {},
    documentRef: { id, source },
    duration: 2,
    effectInstanceId: 'instance-1',
    fps: 30,
    frameIndex: 15,
    height: document.animation.h,
    inputFrames: {},
    kind: 'renderFrame',
    progress: 0.25,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    renderHeight: document.animation.h,
    renderWidth: document.animation.w,
    requestId: 'request-1',
    sequenceId: 1,
    snapshotId: `effect:${id}`,
    time: 0.5,
    width: document.animation.w,
  };
}
