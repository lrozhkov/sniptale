import type { RecordingTelemetrySnapshot } from '../../../contracts/messaging/contracts/response-types';

export type TelemetryListeners = {
  click: (event: MouseEvent) => void;
  change: (event: Event) => void;
  input: (event: Event) => void;
  keyDown: (event: KeyboardEvent) => void;
  pointerDown: (event: Event) => void;
  pointerMove: (event: Event) => void;
  scroll: (event: Event) => void;
  visibilityChange: () => void;
};

type PointerPosition = {
  x: number;
  y: number;
};

type TelemetrySignal = RecordingTelemetrySnapshot['signals'][number];

export type CursorIdleTelemetrySignal = TelemetrySignal & {
  kind: 'cursor-idle';
  data: {
    dwellMs: number;
  };
};

export type TypingTelemetrySignal = TelemetrySignal & {
  kind: 'typing';
  data: {
    eventCount: number;
    eventType: string;
    lastEventTimeMs: number;
  };
};

export type TelemetryState = {
  accumulatedDurationMs: number;
  actionEvents: RecordingTelemetrySnapshot['actionEvents'];
  cursorIdleSignal: CursorIdleTelemetrySignal | null;
  cursorTrack: RecordingTelemetrySnapshot['cursorTrack'];
  idleTimerId: number | null;
  isEnabled: boolean;
  isPaused: boolean;
  lastKnownPointerPosition: PointerPosition | null;
  lastSampleTimeMs: number;
  listeners: TelemetryListeners | null;
  pointerMoveEventName: 'pointermove' | 'pointerrawupdate';
  pointerStationaryPosition: PointerPosition | null;
  pointerStationaryStartedAtMs: number | null;
  segmentStartedAtTimestamp: number;
  signals: RecordingTelemetrySnapshot['signals'];
  typingSignal: TypingTelemetrySignal | null;
  viewport: RecordingTelemetrySnapshot['viewport'];
};
