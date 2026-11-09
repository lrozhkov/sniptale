/** Canonical protocol labels are source facts, independent of the UI locale. */
export const RECORDING_EVENT_LABELS = { CLICK: 'Click', SCROLL: 'Scroll' } as const;

import type { CursorTrajectorySegment } from '../cursor-trajectory/types';

export const RECORDING_EVENTS_MAX_BLOCK_BYTES = 65_536;
export const RECORDING_EVENTS_MAX_BLOCK_RECORDS = 512;

export interface RecordingEventPoint {
  x: number;
  y: number;
}

interface Modifiers {
  ctrlKey: boolean | null;
  altKey: boolean | null;
  shiftKey: boolean | null;
  metaKey: boolean | null;
}

export interface RecordingKeyCompletion {
  upTimeUs: number | null;
  pressDurationUs: number | null;
  lastObservedTimeUs: number | null;
  repeatCount: number;
  completion: 'observed' | 'released' | 'lost' | 'cancelled';
}

interface RecordingKeyData extends RecordingKeyCompletion, Modifiers {
  downTimeUs: number | null;
  keyboardAttackId: string | null;
  keyboardOnsetTimeUs: number | null;
  groupId: string | null;
  continuationOf: string | null;
}

interface RecordingClickCompletion extends Modifiers {
  gestureType: 'click' | 'hold' | 'drag' | 'selection' | 'native-drag' | null;
  completion: 'observed' | 'released' | 'lost' | 'cancelled' | 'semantic';
  upTimeUs: number | null;
  pressDurationUs: number | null;
  lastObservedTimeUs: number | null;
  semanticEndTimeUs: number | null;
  dragStartTimeUs: number | null;
  pointerCancelled: boolean | null;
  dropObserved: boolean | null;
  upPoint: RecordingEventPoint | null;
}

interface RecordingClickData extends RecordingClickCompletion {
  button: number;
  gestureId: string | null;
  downTimeUs: number | null;
  clickCount: number;
}

interface RecordingScrollData extends Modifiers {
  eventType: 'wheel' | 'scroll' | null;
  deltaX: number | null;
  deltaY: number | null;
  deltaZ: number | null;
  deltaMode: number | null;
  scrollX: number | null;
  scrollY: number | null;
}

interface ActionFacts {
  id: string;
  timeUs: number;
  durationUs: number;
  point: RecordingEventPoint | null;
  label: string;
  preset: 'NONE';
}

export type RecordingEventAction = ActionFacts &
  (
    | { kind: 'KEY'; data: RecordingKeyData }
    | { kind: 'CLICK'; data: RecordingClickData }
    | { kind: 'SCROLL'; data: RecordingScrollData }
    | { kind: 'PAUSE'; data: { phase: 'pause' | 'resume' } }
  );

interface SignalFacts {
  id: string;
  startTimeUs: number;
  endTimeUs: number;
  point: RecordingEventPoint | null;
}

type RecordingEventSignal = SignalFacts &
  (
    | {
        kind: 'typing';
        data: {
          eventCount: number | null;
          activity: 'keyboard' | 'input';
          privacy: 'normal' | 'protected' | 'unknown';
          groupId: string | null;
          continuationOf: string | null;
        };
      }
    | {
        kind: 'keyboard-hold';
        data: {
          privacy: 'normal';
          downTimeUs: number | null;
          upTimeUs: number | null;
          pressDurationUs: number | null;
          lastObservedTimeUs: number | null;
          repeatCount: number;
          completion: 'released' | 'lost' | 'cancelled';
        };
      }
    | { kind: 'cursor-idle'; data: { source: 'native-cursor' | 'browser-cursor' } }
    | {
        kind: 'static-frame';
        data: { source: string | null; code: string; severity: 'warning' };
      }
  );

export interface RecordingEventCadence {
  version: 1;
  id: string;
  startTimeUs: number;
  quantumUs: 1;
  count: number;
  encoding: 'delta-us' | 'rle-us';
  ticks: number[];
}

interface Envelope {
  recordSeq: number;
  segmentId: number;
  activeTimeUs: number;
}

export type RecordingEventRecord = Envelope &
  (
    | {
        kind: 'segment';
        clock: CursorTrajectorySegment['clock'];
        reason: 'start' | 'resume' | 'visibility' | 'privacy' | 'clock-discontinuity' | 'after-gap';
      }
    | {
        kind: 'boundary';
        reason: 'pause' | 'stop' | 'visibility' | 'privacy' | 'clock-discontinuity';
      }
    | { kind: 'action'; action: RecordingEventAction }
    | {
        kind: 'action-update';
        actionId: string;
        revision: number;
        data: RecordingKeyCompletion | RecordingClickCompletion;
      }
    | { kind: 'signal'; signal: RecordingEventSignal }
    | {
        kind: 'keyboard-repeat-block';
        ownerKind: 'action' | 'signal';
        ownerId: string;
        phase: 'onset' | 'repeat';
        cadence: RecordingEventCadence;
      }
    | {
        kind: 'gap';
        source: 'keyboard' | 'signal' | 'producer';
        fromTimeUs: number;
        toTimeUs: number | null;
        firstLostSourceSeq: number | null;
        lastLostSourceSeq: number | null;
        lostCount: number | null;
        reason:
          | 'input-overflow'
          | 'writer-backpressure'
          | 'storage-failure'
          | 'source-unavailable'
          | 'clock-discontinuity'
          | 'unknown-record'
          | 'oversize-record'
          | 'counter-overflow';
      }
  );

export interface RecordingEventsBlock {
  formatVersion: 1;
  recordingId: string;
  eventStreamId: string;
  sequence: number;
  startTimeUs: number;
  endTimeUs: number;
  records: RecordingEventRecord[];
}

/** Counts describe the committed prefix. History bytes have an independent receipt. */
export interface RecordingEventsDescriptor {
  format: 'recording-events-v1';
  formatVersion: 1;
  algorithm: 'lossless-v1';
  encoding: 'json-utf8-v1';
  eventStreamId: string;
  state: 'complete' | 'incomplete' | 'unavailable';
  finalized: boolean;
  totalBlocks: number;
  totalRecords: number;
  totalBytes: number;
  streamSha256: string;
}

export interface RecordingEventsManifestEntry {
  sequence: number;
  startTimeUs: number;
  endTimeUs: number;
  recordCount: number;
  byteLength: number;
  blockSha256: string;
  prefixSha256: string;
}
