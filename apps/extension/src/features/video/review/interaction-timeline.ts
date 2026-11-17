import {
  encodeRecordingKeyboardRhythm,
  iterateRecordingKeyboardRhythm,
} from '../project/keyboard-rhythm';
import {
  decodeRecordingEventCadence,
  encodeRecordingEventCadence,
} from '../project/recording-events/records';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ReviewTelemetryMarker } from './telemetry-types';

import type {
  ReviewInteractionFamily,
  ReviewAuthoredPress,
  ReviewInteractionTimeline,
} from './interaction-types';
const validTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86400;
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256;

/** Authored presentation is independent of immutable capture facts. */
export function parseReviewInteractionTimeline(
  raw: unknown
): ReviewInteractionTimeline | undefined | null {
  if (raw === undefined) return undefined;
  if (
    !isRecord(raw) ||
    !Array.isArray(raw['presses']) ||
    !Array.isArray(raw['overrides']) ||
    raw['presses'].length > 10000 ||
    raw['overrides'].length > 10000
  )
    return null;
  const presses: ReviewAuthoredPress[] = [],
    overrides: ReviewInteractionTimeline['overrides'] = [];
  const ids = new Set<string>();
  for (const p of raw['presses']) {
    if (
      !isRecord(p) ||
      (p['timeDomain'] !== undefined && p['timeDomain'] !== 'result') ||
      !validId(p['id']) ||
      ids.has(p['id']) ||
      (p['family'] !== 'keyboard' && p['family'] !== 'mouse') ||
      !validTime(p['start']) ||
      !validTime(p['end']) ||
      p['end'] <= p['start'] ||
      typeof p['label'] !== 'string' ||
      !p['label'].trim() ||
      p['label'].length > 120 ||
      typeof p['button'] !== 'number' ||
      ![0, 1, 2].includes(p['button']) ||
      typeof p['x'] !== 'number' ||
      !Number.isFinite(p['x']) ||
      p['x'] < 0 ||
      p['x'] > 1 ||
      typeof p['y'] !== 'number' ||
      !Number.isFinite(p['y']) ||
      p['y'] < 0 ||
      p['y'] > 1
    )
      return null;
    const keys = p['keys'];
    if (
      keys !== undefined &&
      (!Array.isArray(keys) ||
        !keys.length ||
        keys.length > 8 ||
        keys.some((k) => typeof k !== 'string' || !k.trim() || k.length > 64))
    )
      return null;
    ids.add(p['id']);
    presses.push({
      ...(p['timeDomain'] === 'result' ? { timeDomain: 'result' as const } : {}),
      id: p['id'],
      family: p['family'],
      start: p['start'],
      end: p['end'],
      label: p['label'],
      ...(Array.isArray(keys)
        ? { keys: keys.filter((key): key is string => typeof key === 'string') }
        : {}),
      button: p['button'],
      x: p['x'],
      y: p['y'],
    });
  }
  ids.clear();
  for (const p of raw['overrides']) {
    if (
      !isRecord(p) ||
      (p['timeDomain'] !== undefined && p['timeDomain'] !== 'result') ||
      !isRecord(p['ref']) ||
      !validId(p['ref']['id']) ||
      !validTime(p['start']) ||
      !validTime(p['end']) ||
      p['end'] < p['start'] ||
      typeof p['enabled'] !== 'boolean'
    )
      return null;
    const kind = p['ref']['kind'];
    if (kind !== 'action' && kind !== 'signal' && kind !== 'cursor') return null;
    const key = JSON.stringify([kind, p['ref']['id']]);
    if (ids.has(key)) return null;
    ids.add(key);
    const source =
      p['source'] === undefined
        ? undefined
        : parseReviewInteractionTimeline({ presses: [p['source']], overrides: [] })?.presses[0];
    if (p['source'] !== undefined && (!source || kind !== 'action' || source.id !== p['ref']['id']))
      return null;
    const range = p['sourceRange'];
    if (
      range !== undefined &&
      (!isRecord(range) ||
        !validTime(range['start']) ||
        !validTime(range['end']) ||
        range['end'] < range['start'])
    )
      return null;
    overrides.push({
      ...(p['timeDomain'] === 'result' ? { timeDomain: 'result' as const } : {}),
      ...(isRecord(range) && validTime(range['start']) && validTime(range['end'])
        ? { sourceRange: { start: range['start'], end: range['end'] } }
        : {}),
      ...(source ? { source } : {}),
      ref: { kind, id: p['ref']['id'] },
      start: p['start'],
      end: p['end'],
      enabled: p['enabled'],
    });
  }
  return { presses, overrides };
}
export function reviewInteractionFamily(
  marker: ReviewTelemetryMarker
): ReviewInteractionFamily | undefined {
  if (['KEY', 'KEY_HOLD', 'KEY_MODIFIERS', 'typing'].includes(marker.eventType)) return 'keyboard';
  if (
    marker.ref.kind === 'cursor' ||
    marker.eventType.startsWith('cursor-') ||
    ['PAUSE', 'CALLOUT'].includes(marker.eventType)
  )
    return undefined;
  return 'mouse';
}

/** Every consumer interprets authored timing before applying the shared cut/speed map. */
export function resolveReviewInteractions(
  markers: readonly ReviewTelemetryMarker[],
  timeline: ReviewInteractionTimeline | undefined,
  enabled?: { keyboard?: boolean; mouse?: boolean; actions?: boolean }
): ReviewTelemetryMarker[] {
  const overrides = new Map((timeline?.overrides ?? []).map((p) => [JSON.stringify(p.ref), p]));
  const sourceKeys = new Set(markers.map((m) => JSON.stringify(m.ref)));
  const retained = (timeline?.overrides ?? []).flatMap((o) =>
    o.source && !sourceKeys.has(JSON.stringify(o.ref)) ? [o.source] : []
  );
  const authored: ReviewTelemetryMarker[] = [...(timeline?.presses ?? []), ...retained].map(
    (p) => ({
      ...(p.timeDomain ? { timeDomain: p.timeDomain } : {}),
      ref: { kind: 'action', id: p.id },
      eventType: p.family === 'keyboard' ? 'KEY' : 'CLICK',
      target: p.label,
      start: p.start,
      end: p.end,
      mouseButton: p.button,
      focusPoint: { x: p.x, y: p.y },
      audio: p.family === 'keyboard' ? { family: 'keyboard', keyCount: 1 } : { family: 'mouse' },
    })
  );
  return [...markers, ...authored]
    .flatMap((marker) => {
      const family = reviewInteractionFamily(marker);
      if (family && (enabled?.[family] ?? enabled?.actions) === false) return [];
      const change = overrides.get(JSON.stringify(marker.ref));
      if (!change) return [marker];
      if (!change.enabled) return [];
      const delta = change.start - marker.start;
      const span = marker.end - marker.start;
      const time = (value: number) =>
        change.start +
        (span > 0
          ? ((value - marker.start) * (change.end - change.start)) / span
          : value - marker.start);
      const keyboardTime = (block: ReturnType<typeof encodeRecordingKeyboardRhythm>) =>
        change.end - change.start === span || span <= 0
          ? { ...block, startTime: block.startTime + delta }
          : encodeRecordingKeyboardRhythm(
              block.id,
              [...iterateRecordingKeyboardRhythm(block)].map((attack) => time(attack.time))
            );
      const cadenceTime = (block: ReturnType<typeof encodeRecordingEventCadence>) =>
        change.end - change.start === span || span <= 0
          ? { ...block, startTimeUs: block.startTimeUs + Math.round(delta * 1000000) }
          : encodeRecordingEventCadence(
              block.id,
              (decodeRecordingEventCadence(block) ?? []).map((value) =>
                Math.round(time(value / 1000000) * 1000000)
              )
            );
      return [
        {
          ...marker,
          ...(change.timeDomain ? { timeDomain: change.timeDomain } : {}),
          start: change.start,
          end: change.end,
          ...(marker.keyboardAttack
            ? {
                keyboardAttack: {
                  ...marker.keyboardAttack,
                  time: time(marker.keyboardAttack.time),
                },
              }
            : {}),
          ...(marker.gesture
            ? {
                gesture: {
                  ...marker.gesture,
                  downTime: time(marker.gesture.downTime),
                  ...(marker.gesture.upTime !== undefined
                    ? { upTime: time(marker.gesture.upTime) }
                    : {}),
                  ...(marker.gesture.observedEndTime !== undefined
                    ? { observedEndTime: time(marker.gesture.observedEndTime) }
                    : {}),
                  ...(marker.gesture.path
                    ? { path: marker.gesture.path.map((p) => ({ ...p, time: time(p.time) })) }
                    : {}),
                  ...(marker.gesture.gaps
                    ? {
                        gaps: marker.gesture.gaps.map((g) => ({
                          start: time(g.start),
                          end: time(g.end),
                        })),
                      }
                    : {}),
                },
              }
            : {}),
          ...(marker.keyboardRhythm
            ? {
                keyboardRhythm: marker.keyboardRhythm.map(keyboardTime),
              }
            : {}),
          ...(marker.keyboardRepeats
            ? {
                keyboardRepeats: marker.keyboardRepeats.map(keyboardTime),
              }
            : {}),
          ...(marker.recordingCadence
            ? {
                recordingCadence: {
                  onsets: marker.recordingCadence.onsets.map(cadenceTime),
                  repeats: marker.recordingCadence.repeats.map(cadenceTime),
                },
              }
            : {}),
        },
      ];
    })
    .sort((a, b) => a.start - b.start || a.ref.id.localeCompare(b.ref.id));
}

/** Inverse windows locate original facts without persisting archive samples in the project. */
export function reviewInteractionSourceQueries(
  timeline: ReviewInteractionTimeline | undefined,
  destination: { start: number; end: number }
) {
  return (timeline?.overrides ?? []).flatMap((override) => {
    const source = override.sourceRange ?? override.source;
    if (
      !override.enabled ||
      !source ||
      override.end < destination.start ||
      override.start > destination.end
    )
      return [];
    const span = override.end - override.start;
    const original = (value: number) =>
      source.start +
      (span > 0 ? ((value - override.start) * (source.end - source.start)) / span : 0);
    return [
      {
        ref: override.ref,
        range: {
          start: original(Math.max(override.start, destination.start)),
          end: original(Math.min(override.end, destination.end)),
        },
      },
    ];
  });
}
