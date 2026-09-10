import { useEffect, useMemo, useRef, useState } from 'react';
import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';
import { createEffectRuntimeSandboxExecutor } from '../../../workflows/video/effect-runtime-sandbox';
import { createEffectRuntimeRenderMessage } from '../../../features/video/composition/effect-runtime/runtime/request';
import { createTimelineThumbnailStore } from '../../../composition/persistence/video-preview-cache/thumbnails';
import { defaultVideoPreviewCacheDatabase } from '../../../composition/persistence/video-preview-cache/database';
import type { EffectRuntimeSandboxExecutor } from '../../../contracts/effect-runtime/types';
import type { VideoProject } from '../../../features/video/project/types';
import type {
  TimelineClipPreviewMap,
  TimelinePreviewViewport,
} from '../../contracts/timeline-preview';
import { buildEffectThumbnailPlans } from './effect-thumbnail-plans';

export function useEffectClipPreviews(
  project: VideoProject | null,
  viewport: TimelinePreviewViewport | null
): TimelineClipPreviewMap {
  const plans = useMemo(() => buildEffectThumbnailPlans(project, viewport), [project, viewport]);
  const key = JSON.stringify(plans.map((plan) => [plan.clipId, plan.key]));
  const retained = useRef({ key, plans });
  if (retained.current.key !== key) retained.current = { key, plans };
  const stable = retained.current.plans;
  const [previews, setPreviews] = useState<TimelineClipPreviewMap>({});
  useEffect(() => {
    let cancelled = false;
    let executor: EffectRuntimeSandboxExecutor | undefined;
    let sequenceId = 0;
    const urls: string[] = [];
    const store = createTimelineThumbnailStore({
      database: defaultVideoPreviewCacheDatabase,
      now: Date.now,
      randomUUID: () => crypto.randomUUID(),
    });
    const next: TimelineClipPreviewMap = {};
    setPreviews(next);
    void (async () => {
      if (!stable.length) return;
      const token = await store.begin().catch(() => null);
      for (const item of stable) {
        if (cancelled) break;
        try {
          const sourceKey =
            'effect-v1-thumbnail:' +
            (await sha256EffectV1Bytes(new TextEncoder().encode(item.key)));
          const hits = await store
            .load(item.projectId, sourceKey, [item.plan.time])
            .catch(() => []);
          if (cancelled) break;
          let blob = hits[0]?.blob;
          if (!blob) {
            executor ??= createEffectRuntimeSandboxExecutor();
            const command = await createEffectRuntimeRenderMessage({
              plan: item.plan,
              inputFrames: {},
              requestId: crypto.randomUUID(),
              sequenceId: ++sequenceId,
            });
            if (cancelled) break;
            const frame = await executor.renderFrame(command);
            if (frame.kind !== 'frame') continue;
            try {
              if (cancelled) break;
              const canvas = new OffscreenCanvas(frame.bitmap.width, frame.bitmap.height);
              const context = canvas.getContext('2d');
              if (!context) continue;
              context.drawImage(frame.bitmap, 0, 0);
              blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
              canvas.width = canvas.height = 0;
            } finally {
              frame.bitmap.close();
            }
            if (token && blob && !cancelled)
              await store
                .commit(token, [
                  {
                    projectId: item.projectId,
                    sourceKey,
                    sourceTime: item.plan.time,
                    blob,
                    createdAt: Date.now(),
                  },
                ])
                .catch(() => undefined);
          }
          if (cancelled || !blob) break;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          next[item.clipId] = { kind: 'image', url };
          setPreviews({ ...next });
        } catch {
          /* Optional derived cover; the clip remains editable without a thumbnail. */
        }
      }
      executor?.dispose();
      executor = undefined;
    })();
    return () => {
      cancelled = true;
      executor?.dispose();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [stable]);
  return previews;
}
