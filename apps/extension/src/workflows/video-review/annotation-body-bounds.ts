import {
  resolveAnimationObjectRenderBounds,
  type AnimationTemplate,
} from '@sniptale/runtime-contracts/animation-template';
import { animationRuntimeDuration } from '../../contracts/effect-runtime/animation';
import type { EffectRuntimeSandboxExecutor } from '../../contracts/effect-runtime/types';
import { createEffectRuntimeRenderMessage } from '../../features/video/composition/effect-runtime/runtime/request';
import type { ReviewAnnotationEffectSnapshot } from '../../features/video/review/annotation-effects/types';

/** Reference-pose ink bounds in authored coordinates. This advisory read never changes rendered pixels. */
export async function measureReviewAnnotationBody(args: {
  executor: EffectRuntimeSandboxExecutor;
  snapshot: ReviewAnnotationEffectSnapshot;
  document: AnimationTemplate;
  controls: Record<string, number | string>;
  signal: AbortSignal;
}) {
  args.signal.throwIfAborted();
  const bounds = resolveAnimationObjectRenderBounds(args.document, args.controls);
  const scale = Math.min(1, 640 / Math.max(bounds.width, bounds.height));
  const width = Math.max(1, Math.ceil(bounds.width * scale));
  const height = Math.max(1, Math.ceil(bounds.height * scale));
  const duration = animationRuntimeDuration(args.document);
  const time = duration / 2;
  const result = await args.executor.renderFrame(
    await createEffectRuntimeRenderMessage({
      verifiedDocument: {
        source: args.snapshot.source,
        sha256: args.snapshot.sha256,
        document: args.document,
      },
      plan: {
        assets: [],
        controls: args.controls,
        dimensions: { width: bounds.width, height: bounds.height },
        renderDimensions: { width, height },
        documentSha256: args.snapshot.sha256,
        documentSource: args.snapshot.source,
        duration,
        effectInstanceId: 'annotation-body-measurement',
        fps: 30,
        frameIndex: Math.floor(time * 30),
        kind: 'standalone',
        progress: 0.5,
        time,
        snapshotId: args.snapshot.id,
        target: { kind: 'scene', clipId: 'annotation-body-measurement' },
      },
      inputFrames: {},
      requestId: crypto.randomUUID(),
      sequenceId: 1,
    })
  );
  if (result.kind !== 'frame') throw new Error('Annotation body measurement unavailable.');
  try {
    args.signal.throwIfAborted();
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Annotation body pixels unavailable.');
    context.drawImage(result.bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data;
    let left = width,
      top = height,
      right = -1,
      bottom = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3]! < 8) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    if (right < left || bottom < top) return null;
    left = Math.max(0, left - 1);
    top = Math.max(0, top - 1);
    right = Math.min(width, right + 2);
    bottom = Math.min(height, bottom + 2);
    return {
      x: bounds.x + (left * bounds.width) / width,
      y: bounds.y + (top * bounds.height) / height,
      width: ((right - left) * bounds.width) / width,
      height: ((bottom - top) * bounds.height) / height,
    };
  } finally {
    result.bitmap.close();
  }
}
