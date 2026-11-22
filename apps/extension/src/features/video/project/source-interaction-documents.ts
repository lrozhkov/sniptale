import { isVideoProjectActionPresentationOverride } from './validation/interaction';
import { parseReviewActionAudio, parseReviewClickAnimations } from './action-feedback/validation';
import { parseReviewKeyAnimations } from './action-feedback/key-animation';
import type { VideoProjectActionFeedback } from './action-feedback/types';
import { recordingIdForProjectAsset } from './source-interactions';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseCursorMotions, withCursorMotionPath } from './cursor-motion';
import {
  parseReviewInteractionTimeline,
  resolveReviewInteractions,
} from '../review/interaction-timeline';
import type {
  VideoProject,
  VideoProjectVideoClip,
  VideoProjectSourceInteractionDocument,
} from './types';
import { getVideoClipSourceTime, getVideoClipInteractionTime } from './timeline/rate';

export type { VideoProjectSourceInteractionDocument } from './types/model';

const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value;
const fields = new Set([
  'id',
  'binding',
  'cursorMotions',
  'cursorEnabled',
  'timeline',
  'keyboardEnabled',
  'mouseEnabled',
  'feedback',
  'actionOverrides',
]);

/** Admit retained authoring once at the canonical project boundary with aggregate input budgets. */
export function parseVideoProjectSourceInteractionDocuments(
  raw: unknown
): VideoProjectSourceInteractionDocument[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 128) return null;
  const ids = new Set<string>(),
    bindings = new Set<string>();
  const result: VideoProjectSourceInteractionDocument[] = [];
  let motions = 0,
    presses = 0,
    overrides = 0,
    settingsCount = 0,
    stylesCount = 0,
    keysCount = 0;
  for (const entry of raw) {
    if (
      !isRecord(entry) ||
      Object.keys(entry).some((key) => !fields.has(key)) ||
      !identity(entry['id']) ||
      ids.has(entry['id']) ||
      !isRecord(entry['binding']) ||
      Object.keys(entry['binding']).some(
        (key) => key !== 'assetId' && key !== 'sourceInstanceId'
      ) ||
      !identity(entry['binding']['assetId']) ||
      !identity(entry['binding']['sourceInstanceId']) ||
      typeof entry['cursorEnabled'] !== 'boolean' ||
      typeof entry['keyboardEnabled'] !== 'boolean' ||
      typeof entry['mouseEnabled'] !== 'boolean'
    )
      return null;
    const rawOverrides = entry['actionOverrides'];
    const actionOverrides: NonNullable<VideoProjectActionFeedback['actionOverrides']> = [];
    if (rawOverrides !== undefined) {
      if (!Array.isArray(rawOverrides) || rawOverrides.length > 10000) return null;
      const seen = new Set<string>();
      for (const item of rawOverrides) {
        if (
          !isRecord(item) ||
          Object.keys(item).some((key) => key !== 'id' && key !== 'presentation') ||
          !identity(item['id']) ||
          seen.has(item['id']) ||
          !isVideoProjectActionPresentationOverride(item['presentation']) ||
          Object.keys(item['presentation']).some(
            (key) =>
              ![
                'clickStyle',
                'keyStyle',
                'easing',
                'enabled',
                'preset',
                'duration',
                'offset',
                'point',
              ].includes(key)
          ) ||
          (item['presentation'].point !== undefined &&
            (item['presentation'].point.x < 0 ||
              item['presentation'].point.x > 1 ||
              item['presentation'].point.y < 0 ||
              item['presentation'].point.y > 1))
        )
          return null;
        seen.add(item['id']);
        actionOverrides.push({
          id: item['id'],
          presentation: structuredClone(item['presentation']),
        });
      }
    }
    overrides += actionOverrides.length;
    const rawFeedback = entry['feedback'];
    let feedback: VideoProjectSourceInteractionDocument['feedback'];
    if (rawFeedback !== undefined) {
      if (
        !isRecord(rawFeedback) ||
        Object.keys(rawFeedback).some(
          (key) => !['settings', 'gestureStyles', 'keyStyles'].includes(key)
        )
      )
        return null;
      const settings = parseReviewActionAudio(rawFeedback['settings']);
      const gestureStyles = parseReviewClickAnimations(rawFeedback['gestureStyles']);
      const keyStyles = parseReviewKeyAnimations(rawFeedback['keyStyles']);
      if (!settings || gestureStyles === null || keyStyles === null) return null;
      settingsCount += settings.length;
      stylesCount += gestureStyles?.length ?? 0;
      keysCount += keyStyles?.length ?? 0;
      if (settingsCount > 10000 || stylesCount > 10000 || keysCount > 10000) return null;
      feedback = {
        settings,
        ...(gestureStyles ? { gestureStyles } : {}),
        ...(keyStyles ? { keyStyles } : {}),
      };
    }
    const key = JSON.stringify([entry['binding']['assetId'], entry['binding']['sourceInstanceId']]);
    if (bindings.has(key)) return null;
    const cursorMotions = parseCursorMotions(entry['cursorMotions']);
    const timeline = parseReviewInteractionTimeline(entry['timeline']);
    if (!cursorMotions || !timeline) return null;
    motions += cursorMotions.length;
    presses += timeline.presses.length;
    overrides += timeline.overrides.length;
    if (motions > 512 || presses > 10000 || overrides > 10000) return null;
    ids.add(entry['id']);
    bindings.add(key);
    result.push({
      ...(feedback ? { feedback } : {}),
      ...(actionOverrides.length ? { actionOverrides } : {}),
      id: entry['id'],
      binding: {
        assetId: entry['binding']['assetId'],
        sourceInstanceId: entry['binding']['sourceInstanceId'],
      },
      cursorMotions,
      timeline,
      cursorEnabled: entry['cursorEnabled'],
      keyboardEnabled: entry['keyboardEnabled'],
      mouseEnabled: entry['mouseEnabled'],
    });
  }
  return result;
}

/** Duplicate the bound authored document atomically within existing aggregate input budgets. */
export function duplicateProjectSourceInteractionDocuments(
  documents: readonly VideoProjectSourceInteractionDocument[],
  instances: ReadonlyMap<string, string>,
  createId: () => string
) {
  const cursorIds = new Map<string, string>();
  const copies = documents.flatMap((document) => {
    const sourceInstanceId = instances.get(document.binding.sourceInstanceId);
    if (!sourceInstanceId) return [];
    const cursorMotions = document.cursorMotions.map((motion) => {
      const id = createId();
      cursorIds.set(JSON.stringify([document.binding.sourceInstanceId, motion.id]), id);
      return {
        ...structuredClone(motion),
        id,
        points: motion.points.map((point) => {
          const pointId = createId();
          cursorIds.set(
            JSON.stringify([document.binding.sourceInstanceId, motion.id, point.id]),
            pointId
          );
          return { ...point, id: pointId };
        }),
      };
    });
    return [
      {
        ...structuredClone(document),
        id: createId(),
        binding: { ...document.binding, sourceInstanceId },
        cursorMotions,
      },
    ];
  });
  const parsed = parseVideoProjectSourceInteractionDocuments([...documents, ...copies]);
  return parsed ? { documents: parsed, cursorIds } : null;
}

/** Retained cut content can have no current placement; a live source identity cannot belong to another asset. */
export function hasValidVideoProjectSourceInteractionReferences(project: VideoProject): boolean {
  return (project.sourceInteractionDocuments ?? []).every((document) => {
    const asset = project.assets.find((asset) => asset.id === document.binding.assetId);
    return (
      !!asset &&
      asset.type !== 'AUDIO' &&
      asset.type !== 'IMAGE' &&
      (!document.feedback || !recordingIdForProjectAsset(asset)) &&
      project.clips.every(
        (clip) =>
          clip.type !== 'VIDEO' ||
          clip.sourceInstanceId !== document.binding.sourceInstanceId ||
          (clip.assetId === asset.id &&
            (!hasResultSourceInteractionContent(document) ||
              clip.sourceInteractionTiming !== undefined))
      )
    );
  });
}

/** Result authoring requires an admitted per-placement origin; source facts retain their clock. */
export function hasResultSourceInteractionContent(
  document: VideoProjectSourceInteractionDocument
): boolean {
  return (
    document.cursorMotions.some((motion) => motion.timeDomain === 'result') ||
    document.timeline.presses.some((press) => press.timeDomain === 'result') ||
    document.timeline.overrides.some(
      (override) => override.timeDomain === 'result' || override.source?.timeDomain === 'result'
    )
  );
}

/** The retained document owns the time domain of its derived action facts. */
export function isResultSourceInteractionAction(
  project: VideoProject,
  event: import('./types').VideoProjectActionEvent
): boolean {
  const anchor = event.anchor;
  if (anchor.kind === 'project') return false;
  const document = project.sourceInteractionDocuments?.find(
    (doc) =>
      doc.binding.sourceInstanceId === anchor.sourceInstanceId &&
      (anchor.kind === 'source'
        ? doc.binding.assetId === anchor.assetId
        : recordingIdForProjectAsset(
            project.assets.find((asset) => asset.id === doc.binding.assetId)
          ) === anchor.recordingId)
  );
  if (!document) return false;
  const override = document.timeline.overrides.find(
    (item) => item.ref.kind === 'action' && item.ref.id === anchor.sourceEventId
  );
  const press =
    document.timeline.presses.find((item) => item.id === anchor.sourceEventId) ??
    (event.id === JSON.stringify(['authored-source-input', document.id, anchor.sourceEventId])
      ? override?.source
      : undefined);
  return (override?.timeDomain ?? press?.timeDomain) === 'result';
}

/** Focus edits retain the authored segment identity and its declared document clock. */
export function isResultSourceCursorSegment(
  project: VideoProject,
  segment: import('./cursor-focus-path/types').CursorFocusSegment
): boolean {
  const binding = segment.binding;
  return (
    binding.kind !== 'project' &&
    (project.sourceInteractionDocuments ?? []).some(
      (document) =>
        document.binding.sourceInstanceId === binding.sourceInstanceId &&
        (binding.kind !== 'source' || document.binding.assetId === binding.assetId) &&
        document.cursorMotions.some(
          (motion) => motion.id === segment.id && motion.timeDomain === 'result'
        )
    )
  );
}

/** Resolve physical source facts and retained result authoring through separate admitted clocks. */
export function resolveProjectSourceInteractionDocument(
  project: VideoProject,
  time: number,
  sourceClipId?: string
) {
  for (const document of project.sourceInteractionDocuments ?? []) {
    const clip = project.clips.find(
      (clip): clip is VideoProjectVideoClip =>
        clip.type === 'VIDEO' &&
        (!sourceClipId || clip.id === sourceClipId) &&
        clip.assetId === document.binding.assetId &&
        clip.sourceInstanceId === document.binding.sourceInstanceId &&
        time >= clip.startTime &&
        time < clip.startTime + clip.duration &&
        project.tracks.some((track) => track.id === clip.trackId && track.visible)
    );
    if (clip)
      return {
        document,
        clip,
        sourceTime: getVideoClipSourceTime(clip, time),
        resultTime: getVideoClipInteractionTime(clip, time),
      };
  }
  return null;
}

/** Apply retained cursor intervals in their declared clocks without a second authored path. */
export function withProjectSourceCursorFocus(
  project: VideoProject,
  path: import('./cursor-focus-path/types').CursorFocusPath
) {
  let result = path;
  for (const document of project.sourceInteractionDocuments ?? []) {
    if (!document.cursorEnabled || !document.cursorMotions.some((motion) => motion.enabled))
      continue;
    const asset = project.assets.find((asset) => asset.id === document.binding.assetId);
    const recordingId = recordingIdForProjectAsset(asset);
    const binding = recordingId
      ? {
          kind: 'recording-source' as const,
          recordingId,
          sourceInstanceId: document.binding.sourceInstanceId,
        }
      : { kind: 'source' as const, ...document.binding };
    const sameSource = (segment: import('./cursor-focus-path/types').CursorFocusSegment) =>
      segment.binding.kind !== 'project' &&
      segment.binding.sourceInstanceId === document.binding.sourceInstanceId &&
      (segment.binding.kind === 'source'
        ? segment.binding.assetId === document.binding.assetId
        : segment.binding.recordingId === recordingId);
    const scoped = withCursorMotionPath(
      { ...result, segments: result.segments.filter(sameSource) },
      document.cursorMotions.filter((motion) => motion.timeDomain !== 'result')
    ) ?? { ...result, segments: result.segments.filter(sameSource) };
    result = {
      ...result,
      segments: [
        ...result.segments.filter((segment) => !sameSource(segment)),
        ...(
          withCursorMotionPath(
            undefined,
            document.cursorMotions.filter((motion) => motion.timeDomain === 'result')
          )?.segments ?? []
        ).map((segment) => ({ ...segment, binding })),
        ...scoped.segments.map((segment) => ({
          ...segment,
          binding,
        })),
      ],
    };
  }
  return result;
}

/** Derive action facts in the document clock; captured project events remain unchanged. */
export function projectSourceInteractionActions(
  project: VideoProject,
  actions: readonly import('./types').VideoProjectActionEvent[]
) {
  if (!project.sourceInteractionDocuments?.length) return actions;
  let result = [...actions];
  for (const document of project.sourceInteractionDocuments ?? []) {
    const recordingId = recordingIdForProjectAsset(
      project.assets.find((asset) => asset.id === document.binding.assetId)
    );
    const belongs = (event: import('./types').VideoProjectActionEvent) =>
      event.anchor.kind !== 'project' &&
      event.anchor.sourceInstanceId === document.binding.sourceInstanceId &&
      (event.anchor.kind === 'source'
        ? event.anchor.assetId === document.binding.assetId
        : event.anchor.recordingId === recordingId);
    const source = result
      .filter(belongs)
      .filter(
        (event) =>
          event.anchor.kind === 'project' ||
          event.id !==
            JSON.stringify(['authored-source-input', document.id, event.anchor.sourceEventId])
      );
    const originals = new Map(
      source.flatMap((event) =>
        event.anchor.kind !== 'project' ? [[event.anchor.sourceEventId, event] as const] : []
      )
    );
    const markers: import('../review/telemetry-types').ReviewTelemetryMarker[] = source.flatMap(
      (event) =>
        event.anchor.kind !== 'project'
          ? [
              {
                ref: { kind: 'action' as const, id: event.anchor.sourceEventId },
                eventType: event.kind,
                target: event.label,
                start: event.anchor.sourceTime,
                end: event.anchor.sourceTime + (event.capturedDuration ?? 0),
                ...(event.point ? { focusPoint: event.point } : {}),
              },
            ]
          : []
    );
    const edited = resolveReviewInteractions(markers, document.timeline, {
      keyboard: document.keyboardEnabled,
      mouse: document.mouseEnabled,
    });
    const projected = edited.flatMap<import('./types').VideoProjectActionEvent>((marker) => {
      if (marker.ref.kind !== 'action') return [];
      const original = originals.get(marker.ref.id);
      if (original && original.anchor.kind !== 'project') {
        if (
          marker.timeDomain !== 'result' &&
          marker.start === original.anchor.sourceTime &&
          marker.end - marker.start === (original.capturedDuration ?? 0)
        )
          return [original];
        const start = original.anchor.sourceTime,
          span = original.capturedDuration ?? 0;
        const time = (value: number) =>
          marker.start +
          (span > 0 ? ((value - start) * (marker.end - marker.start)) / span : value - start);
        const data = { ...original.data };
        for (const key of ['downTime', 'upTime', 'semanticEndTime', 'lastObservedTime'])
          if (typeof data[key] === 'number') data[key] = time(data[key]);
        return [
          {
            ...original,
            anchor: { ...original.anchor, sourceTime: marker.start },
            capturedDuration: marker.end - marker.start,
            data,
          },
        ];
      }
      return [
        {
          id: JSON.stringify(['authored-source-input', document.id, marker.ref.id]),
          anchor: recordingId
            ? {
                kind: 'recording-source',
                recordingId,
                sourceInstanceId: document.binding.sourceInstanceId,
                sourceEventId: marker.ref.id,
                sourceTime: marker.start,
              }
            : {
                kind: 'source',
                ...document.binding,
                sourceEventId: marker.ref.id,
                sourceTime: marker.start,
              },
          kind: marker.eventType === 'KEY' ? 'KEY' : 'CLICK',
          label: marker.target ?? '',
          point: marker.focusPoint ?? null,
          capturedDuration: marker.end - marker.start,
          data:
            marker.eventType === 'KEY'
              ? { combo: marker.target ?? '' }
              : { button: marker.mouseButton ?? 0, downTime: marker.start, upTime: marker.end },
        },
      ];
    });
    result = [
      ...result.filter((event) => !belongs(event)),
      ...projected.map((event) => {
        const anchor = event.anchor;
        const presentation =
          anchor.kind !== 'project'
            ? document.actionOverrides?.find((item) => item.id === anchor.sourceEventId)
                ?.presentation
            : undefined;
        return presentation ? { ...event, presentation } : event;
      }),
    ];
  }
  return result;
}
