import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { createQuickEditZoomRegion } from '../../../features/video/review/advanced/zoom';
import type { QuickEditAdvancedContent } from '../../../features/video/review/advanced/types';
import type { ReviewAnnotationEffectSnapshot } from '../../../features/video/review/annotation-effects/types';
import {
  applyReviewOperation,
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import { createReviewCaptionSettings } from '../../../features/video/review/text-document';
import type { ReviewOperation } from '../../../features/video/review/types';
import type { VideoWorkspace } from './contracts';
import { createSolidPaint } from '@sniptale/foundation/paint';

/** Synthetic full snapshots reproduce archive scale without authored text, URLs or media. */
export function createHistoryRetentionWorkspace(
  options: {
    fragments?: number;
    cursor?: number;
    effectSnapshot?: ReviewAnnotationEffectSnapshot;
  } = {}
): VideoWorkspace {
  const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
  const advanced = createQuickEditAdvancedState();
  const history: ReviewOperation[] = [];
  let document = replayReviewHistory([], 0, source, reviewAdvancedContentBaseline(advanced));
  const append = (operation: ReviewOperation) => {
    document = applyReviewOperation(document, operation, source);
    history.push(operation);
  };
  for (let index = 0; index < 28; index++) {
    const start = index * 0.03;
    const range = {
      id: `range-${index}`,
      start,
      end: start + 0.02,
      requestedStart: start,
      requestedEnd: start + 0.02,
    };
    append({
      id: `range-command-${index}`,
      at: index + 1,
      target: 'edit',
      before: null,
      after:
        index % 2 === 0
          ? { ...range, kind: 'cut' }
          : { ...range, kind: 'speed', rate: 2, audio: 'speed' },
    });
  }
  append({
    id: 'annotation-command',
    at: 29,
    target: 'annotation',
    before: null,
    after: {
      id: 'retained-note',
      text: 'Synthetic retained note.',
      anchor: { kind: 'point', time: 3 },
    },
  });
  append({
    id: 'canvas-comment-command',
    at: 30,
    target: 'canvasComment',
    before: null,
    after: {
      id: 'retained-comment',
      text: 'Synthetic retained overlay.',
      visible: true,
      renderToVideo: true,
      attachment: 'content',
      position: { x: 0.5, y: 0.5 },
      style: { fillPaint: createSolidPaint('#123456ff'), textColor: '#ffffffff', radius: 8 },
    },
  });
  for (let index = 0; index < 34; index++) {
    const before = document.advancedContent.audio.original;
    append({
      id: `gain-command-${index}`,
      at: 31 + index,
      target: 'sourceAudio',
      before: { muted: before.muted, volume: before.volume },
      after: { muted: !before.muted, volume: before.volume },
    });
  }
  const fragments = options.fragments ?? 112;
  const text: QuickEditAdvancedContent['text'] = {
    version: 1,
    fragments: Array.from({ length: fragments }, (_, index) => ({
      id: `fragment-${index}`,
      start: 2 + (index * 7) / fragments,
      end: 2 + ((index + 0.8) * 7) / fragments,
      text: 'Synthetic history regression text. '.repeat(3),
      originalText: '',
      revision: 0,
      timingRevision: 0,
      timeDomain: 'result',
      alignment: 'manual',
      showInVideo: false,
    })),
  };
  for (let index = 0; index < 1126; index++) {
    const before = document.advancedContent;
    const after = createRetainedHistoryContent(before, text, index, options.effectSnapshot);
    append({
      id: `content-command-${index}`,
      at: 65 + index,
      target: 'advancedContent',
      before,
      after,
    });
  }
  return {
    aggregateId: 'recording:beta-v1-recording',
    formatVersion: 1,
    source,
    sourceAssetId: 'beta-v1-recording-asset',
    revision: 1,
    history,
    cursor: options.cursor ?? history.length,
    advanced,
    ...(options.effectSnapshot ? { effectSnapshots: [options.effectSnapshot] } : {}),
    createdAt: 1,
    updatedAt: 1190,
  };
}

/** Keeps the scale fixture's full authored content independent of history replay. */
function createRetainedHistoryContent(
  before: QuickEditAdvancedContent,
  text: NonNullable<QuickEditAdvancedContent['text']>,
  index: number,
  effectSnapshot: ReviewAnnotationEffectSnapshot | undefined
): QuickEditAdvancedContent {
  return {
    ...before,
    text,
    captions: createReviewCaptionSettings(),
    canvas: { width: 640, height: 360 },
    background: {
      enabled: true,
      type: 'solid',
      color: index % 2 === 0 ? '#123456ff' : '#654321ff',
      layout: { padding: 12, cornerRadius: 8 },
    },
    zoom: {
      enabled: true,
      regions: [
        {
          ...createQuickEditZoomRegion({
            id: 'retained-focus',
            at: 2,
            duration: 2,
            sourceAnchor: { start: 2, end: 4 },
          }),
          transform: { scale: index % 2 === 0 ? 1.5 : 1.6, centerX: 0.5, centerY: 0.5 },
        },
      ],
    },
    audio: {
      ...before.audio,
      voiceover: [
        {
          id: 'retained-voice',
          assetId: 'project-asset:retained-voice',
          timelineStart: 4,
          sourceOffset: 0,
          duration: 1,
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        },
      ],
      music: [
        {
          id: 'retained-music',
          assetId: 'project-asset:retained-music',
          timelineStart: 6,
          sourceOffset: 0,
          duration: 1,
          volume: 0.2,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        },
      ],
    },
    actionAudio: [
      {
        ref: { kind: 'signal', id: 'retained-typing' },
        enabled: true,
        presetId: 'typing-natural-v1',
        volume: 0.35,
        offset: 0,
      },
    ],
    ...(effectSnapshot
      ? {
          annotationEffects: {
            enabled: true,
            instances: [
              {
                id: 'retained-effect',
                snapshotId: effectSnapshot.id,
                enabled: true,
                start: 2,
                end: 5,
                attachment: 'viewport',
                transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
                controls: {},
                order: 0,
              },
            ],
          },
        }
      : {}),
  };
}
