import type {
  QuickEditAdvancedContent,
  QuickEditTrack,
} from '../../features/video/review/advanced/types';
import type {
  ReviewDocument,
  ReviewSelection,
  ReviewSource,
} from '../../features/video/review/types';
import type { ReviewAnnotationEffectSnapshot } from '../../features/video/review/annotation-effects/types';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import {
  resolveQuickEditActiveFocusRegions,
  quickEditFocusType,
} from '../../features/video/review/advanced/focus-layout';
import {
  originalAudioRangeViews,
  changeOriginalAudioMute,
} from '../../features/video/review/advanced/original-audio-mutes';
import { reviewVoiceoverRange } from '../../features/video/review/voiceover-edits';
import { createTrackProjection } from './track-projection';
import { translate, formatNumber, type AppLocale } from '../../platform/i18n';
import type { ReviewAudioAsset } from './use-review-audio';

export const reviewCursorMotionShapeTitleKeys = {
  arrow: 'gallery.videoReview.cursorShapeArrow',
  pointer: 'gallery.videoReview.cursorShapePointer',
  grab: 'gallery.videoReview.cursorShapeGrab',
  text: 'gallery.videoReview.cursorShapeText',
  crosshair: 'gallery.videoReview.cursorShapeCrosshair',
} as const;

export const reviewTrackTitleKeys = {
  source: 'gallery.videoReview.sourceVideo',
  actions: 'gallery.videoReview.telemetry',
  keyboard: 'gallery.videoReview.historyKeyboard',
  mouse: 'gallery.videoReview.historyMouse',
  zoom: 'gallery.videoReview.zoomTrack',
  cursorMotion: 'gallery.videoReview.cursorMotionTrack',
  originalAudio: 'gallery.videoReview.audioOriginal',
  annotationEffects: 'gallery.videoReview.annotationEffects',
  text: 'gallery.videoReview.textTrack',
  voiceover: 'gallery.videoReview.audioVoiceover',
  music: 'gallery.videoReview.audioMusic',
  webcam: 'gallery.videoReview.webcam',
} as const;

export type ReviewTrackItem = {
  id: string;
  start: number;
  end: number;
  label: string;
  detail: string;
  selection: ReviewSelection;
  timelineKey?: string;
  removable: boolean;
  inactive?: boolean;
};

/** List times use the same source axis as the timeline; authored content is never projected away. */
export function reviewTrackItems(args: {
  track: QuickEditTrack;
  document: ReviewDocument;
  source: ReviewSource;
  filename: string;
  assets: ReadonlyMap<string, ReviewAudioAsset>;
  snapshots: readonly ReviewAnnotationEffectSnapshot[];
  locale: AppLocale;
}): ReviewTrackItem[] {
  const { track, document, source } = args;
  const content = document.advancedContent;
  const axis = createTrackProjection(source.duration, document.edits);
  const number = (value: number) => formatNumber(value, { maximumFractionDigits: 2 }, args.locale);
  const title = translate(reviewTrackTitleKeys[track]);
  const base = (selection: ReviewSelection): ReviewTrackItem => ({
    id: 'source',
    start: 0,
    end: source.duration,
    label: args.filename,
    detail: title,
    selection,
    removable: false,
  });
  let rows: ReviewTrackItem[] = [];
  if (track === 'source')
    rows = [
      base({ kind: 'none' }),
      ...document.edits.map((edit) => ({
        id: edit.id,
        start: edit.start,
        end: edit.end,
        label: translate(
          edit.kind === 'cut' ? 'gallery.videoReview.cutLabel' : 'gallery.videoReview.speedMode'
        ),
        detail: edit.kind === 'speed' ? `${number(edit.rate)}×` : '',
        selection: { kind: 'edit' as const, id: edit.id },
        timelineKey: `edit:${edit.id}`,
        removable: true,
      })),
    ];
  if (track === 'cursorMotion')
    rows = (content.cursorMotions ?? []).map((m) => ({
      id: m.id,
      start: m.start,
      end: m.end,
      label: translate(reviewCursorMotionShapeTitleKeys[m.shape]),
      detail: `${m.points.length} · ${m.size}px`,
      selection: { kind: 'cursor-motion' as const, id: m.id },
      timelineKey: `cursor-motion:${m.id}`,
      removable: true,
    }));
  if (track === 'zoom') {
    const active = new Set(
      resolveQuickEditActiveFocusRegions(content.zoom.regions).map((item) => item.id)
    );
    rows = content.zoom.regions.map((region) => {
      const type = quickEditFocusType(region);
      return {
        id: region.id,
        start: region.sourceAnchor?.start ?? axis.source(region.start),
        end: region.sourceAnchor?.end ?? axis.source(region.end, 'end'),
        label: translate(
          type === 'border'
            ? 'gallery.videoReview.focusBorder'
            : type === 'lens'
              ? 'gallery.videoReview.focusLens'
              : type === 'spotlight'
                ? 'gallery.videoReview.focusSpotlight'
                : 'gallery.videoReview.zoomRegionLabel'
        ),
        detail: type === 'zoom' ? `${number(region.transform.scale)}×` : '',
        selection: { kind: 'zoom' as const, id: region.id },
        timelineKey: `focus:${region.id}`,
        removable: true,
        inactive: !active.has(region.id),
      };
    });
  }
  if (track === 'annotationEffects')
    rows = (content.annotationEffects?.instances ?? []).map((item) => {
      const snapshot = args.snapshots.find((snapshot) => snapshot.id === item.snapshotId);
      const definition = snapshot ? readReviewAnnotationEffectDocument(snapshot.source) : null;
      return {
        id: item.id,
        start: item.start,
        end: item.end,
        label: definition?.label[args.locale] ?? definition?.label.en ?? title,
        detail: '',
        selection: { kind: 'annotation-effect' as const, id: item.id },
        timelineKey: `annotation:${item.id}`,
        removable: true,
        inactive: !item.enabled,
      };
    });
  if (track === 'voiceover' || track === 'music')
    rows = content.audio[track].map((clip) => {
      const range =
        track === 'voiceover' && clip.sourceAnchor
          ? reviewVoiceoverRange(clip)
          : {
              start: axis.source(clip.timelineStart),
              end: axis.source(clip.timelineStart + clip.duration / (clip.tempo ?? 1), 'end'),
            };
      return {
        id: clip.id,
        ...range,
        label: args.assets.get(clip.assetId)?.filename || title,
        detail: clip.muted
          ? translate('gallery.videoReview.trackItemMuted')
          : `${number(clip.volume * 100)}%`,
        selection: { kind: 'audio' as const, lane: track, id: clip.id },
        timelineKey: `audio:${clip.id}`,
        removable: true,
        inactive: !!clip.dormant || clip.muted,
      };
    });
  if (track === 'originalAudio')
    rows = [
      base({ kind: 'none' }),
      ...originalAudioRangeViews(content.audio).map((range) => ({
        id: range.id,
        start: range.start,
        end: range.end,
        label: translate('gallery.videoReview.audioClipVolume'),
        detail: `${number(range.volume * 100)}%`,
        selection: { kind: 'original-audio' as const, id: range.id },
        timelineKey: `original-audio:${range.id}`,
        removable: true,
      })),
    ];
  if (track === 'webcam' && content.webcam)
    rows = [
      { ...base({ kind: 'webcam' }), label: title },
      ...content.webcam.positions.map((position) => ({
        id: position.id,
        start: position.time,
        end: position.time,
        label: translate('gallery.videoReview.webcamPosition'),
        detail: '',
        selection: { kind: 'webcam-position' as const, id: position.id },
        timelineKey: `webcam-position:${position.id}`,
        removable: true,
      })),
      ...content.webcam.hiddenRanges.map((range) => ({
        id: range.id,
        start: range.start,
        end: range.end,
        label: translate('gallery.videoReview.webcamHidden'),
        detail: '',
        selection: { kind: 'webcam-hidden' as const, id: range.id },
        timelineKey: `webcam-hidden:${range.id}`,
        removable: true,
      })),
    ];
  return rows.toSorted(
    (a, b) =>
      Number(b.id === 'source') - Number(a.id === 'source') || a.start - b.start || a.end - b.end
  );
}

/** One advanced-content operation preserves media assets and uses the existing Undo owner. */
export function removeReviewTrackItems(
  content: QuickEditAdvancedContent,
  track: QuickEditTrack,
  ids: ReadonlySet<string>,
  duration: number
): QuickEditAdvancedContent {
  if (track === 'cursorMotion')
    return {
      ...content,
      cursorMotions: (content.cursorMotions ?? []).filter((m) => !ids.has(m.id)),
    };
  if (track === 'zoom')
    return {
      ...content,
      zoom: {
        ...content.zoom,
        regions: content.zoom.regions.filter((item) => !ids.has(item.id)),
      },
    };
  if (track === 'annotationEffects' && content.annotationEffects)
    return {
      ...content,
      annotationEffects: {
        ...content.annotationEffects,
        instances: content.annotationEffects.instances.filter((item) => !ids.has(item.id)),
      },
    };
  if (track === 'voiceover' || track === 'music')
    return {
      ...content,
      audio: {
        ...content.audio,
        [track]: content.audio[track].filter((item) => !ids.has(item.id)),
        ...(track === 'voiceover' && content.audio.original.mutes
          ? {
              original: {
                ...content.audio.original,
                mutes: content.audio.original.mutes.filter(
                  (item) => item.kind !== 'take' || !ids.has(item.clipId)
                ),
              },
            }
          : {}),
      },
    };
  if (track === 'originalAudio') {
    let audio = content.audio;
    for (const id of ids) {
      audio = changeOriginalAudioMute({ audio, id, patch: null, duration }) ?? {
        ...audio,
        original: {
          ...audio.original,
          ranges: (audio.original.ranges ?? []).filter((range) => range.id !== id),
        },
      };
    }
    return { ...content, audio };
  }
  if (track === 'webcam' && content.webcam)
    return {
      ...content,
      webcam: {
        ...content.webcam,
        positions: content.webcam.positions.filter((item) => !ids.has(item.id)),
        hiddenRanges: content.webcam.hiddenRanges.filter((item) => !ids.has(item.id)),
      },
    };
  return content;
}
