import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../../../apps/extension/src/features/video/project/scene/focus-appearance';
import { readNativeReviewWorkspace, replaceNativeReviewWorkspace } from './native-review-workspace';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import type { Page } from '@playwright/test';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';

import type {
  ReviewEdit,
  ReviewOperation,
} from '../../../../apps/extension/src/features/video/review/types';

/** Reads the actual persisted sidecar after UI acquisition, including the complete undo history. */
export async function readWebcamWorkspace(page: Page) {
  return readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
}

/** Installs a validated authored composition, retaining the privately acquired source identity. */
export async function seedWebcamComposition(page: Page) {
  const stored = await readWebcamWorkspace(page);
  if (!stored) throw new Error('Review was not saved');
  const document = replayReviewHistory(
    stored.history,
    stored.cursor,
    stored.source,
    reviewAdvancedContentBaseline(stored.advanced)
  );
  const before = document.advancedContent;
  if (!before.webcam) throw new Error('Camera was not acquired');
  const edits: ReviewEdit[] = [
    { id: 'cut', kind: 'cut', start: 1, end: 2, requestedStart: 1, requestedEnd: 2 },
    {
      id: 'fast',
      kind: 'speed',
      start: 2,
      end: 4,
      requestedStart: 2,
      requestedEnd: 4,
      rate: 2,
      audio: 'speed',
    },
    {
      id: 'slow',
      kind: 'speed',
      start: 4,
      end: 5,
      requestedStart: 4,
      requestedEnd: 5,
      rate: 0.25,
      audio: 'speed',
    },
  ];
  const region = (id: string) => ({
    ...createQuickEditZoomRegion({ id, at: 0, duration: 14 }),
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
  });
  const area = { x: 0.65, y: 0.7, width: 0.2, height: 0.2 };
  const operation: ReviewOperation = {
    id: 'webcam-scene',
    at: 2,
    target: 'advancedContent',
    before,
    after: {
      ...before,
      background: {
        enabled: true,
        type: 'solid',
        color: '#778899ff',
        zoomBehavior: 'follow-video',
        layout: { padding: 8, cornerRadius: 12, shadow: { color: '#000000ff', intensity: 50 } },
      },
      windowHeader: {
        ...DEFAULT_WINDOW_HEADER,
        kind: 'browser' as const,
        title: 'Camera parity',
        url: 'https://example.test',
      },
      zoom: {
        enabled: true,
        regions: [
          { ...region('zoom'), transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 } },
          { ...region('dim'), spotlight: { ...createQuickEditSpotlight(), area, strength: 0.8 } },
          {
            ...region('blur'),
            spotlight: { ...createQuickEditSpotlight(), area, effect: 'blur', blur: 24 },
          },
          {
            ...region('border'),
            border: {
              ...createQuickEditBorder(),
              area: { x: 0, y: 0, width: 1, height: 1 },
              width: 24,
            },
          },
        ],
      },
      webcam: {
        ...before.webcam,
        appearance: { ...before.webcam.appearance, shape: 'circle' },
        shadow: { intensity: 60, color: '#123456ff' },
        offsetSeconds: 1,
        placement: { x: 0.73, y: 0.73, width: 0.24, height: 0.24 },
        positions: [
          {
            id: 'top',
            time: 4,
            placement: { x: 0.03, y: 0.03, width: 0.24, height: 0.24 },
            transition: { type: 'ease-in-out', duration: 0.5 },
          },
        ],
        hiddenRanges: [{ id: 'hidden', start: 6, end: 7 }],
      },
    },
  };
  // Add edits before authored effects so their result-clock intervals are not retimed by the fixture.
  const history: ReviewOperation[] = [
    ...stored.history.slice(0, stored.cursor),
    ...edits.map((after): ReviewOperation => ({
      id: `add-${after.id}`,
      at: 2,
      target: 'edit',
      before: null,
      after,
    })),
    operation,
  ];
  const row = parseVideoWorkspace({
    ...stored,
    revision: stored.revision + 1,
    history,
    cursor: history.length,
    updatedAt: Date.now(),
    advanced: {
      ...stored.advanced,
      ui: {
        ...stored.advanced.ui,
        mode: 'advanced',
        tracks: { ...stored.advanced.ui.tracks, zoom: true },
      },
    },
  });
  if (!row) throw new Error('Camera composition fixture is invalid');
  await replaceNativeReviewWorkspace(page, row.aggregateId, row);
}

/** Native decode of real exported bytes; normalized sample points are independent of the painter. */
export async function webcamVideoPixels(
  page: Page,
  encoded: string,
  samples: Array<{ time: number; x: number; y: number }>
) {
  return page.evaluate(
    async ({ encoded, samples }) => {
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))], {
          type: 'video/webm',
        })
      );
      const video = document.createElement('video');
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Video decode failed'));
          video.src = url;
        });
        const canvas = Object.assign(document.createElement('canvas'), {
          width: video.videoWidth,
          height: video.videoHeight,
        });
        const context = canvas.getContext('2d')!;
        const pixels: number[][] = [];
        for (const sample of samples) {
          if (video.currentTime !== sample.time)
            await new Promise<void>((resolve) => {
              video.onseeked = () => resolve();
              video.currentTime = sample.time;
            });
          context.drawImage(video, 0, 0);
          pixels.push([
            ...context.getImageData(
              Math.floor(sample.x * canvas.width),
              Math.floor(sample.y * canvas.height),
              1,
              1
            ).data,
          ]);
        }
        return { pixels, duration: video.duration, width: canvas.width, height: canvas.height };
      } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    },
    { encoded, samples }
  );
}
