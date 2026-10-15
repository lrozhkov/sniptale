import type { RecordingTelemetrySnapshot } from '../../../contracts/messaging/contracts/response-types';

export type TelemetryListeners = {
  click: (event: MouseEvent) => void;
  pointerUp: (event: MouseEvent) => void;
  pointerCancel: (event: MouseEvent) => void;
  mouseDown: (event: MouseEvent) => void;
  mouseUp: (event: MouseEvent) => void;
  pointerLeave: (event: MouseEvent) => void;
  dragStart: (event: DragEvent) => void;
  dragEnd: (event: DragEvent) => void;
  drop: (event: DragEvent) => void;
  selectionChange: (event: Event) => void;
  wheel: (event: WheelEvent) => void;
  keyUp: (event: KeyboardEvent) => void;
  blur: (event?: Event) => void;
  change: (event: Event) => void;
  input: (event: Event) => void;
  keyDown: (event: KeyboardEvent) => void;
  pointerDown: (event: MouseEvent) => void;
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
    observationClockId: string;
    dwellMs: number;
  };
};

export type TypingTelemetrySignal = Omit<TelemetrySignal, 'data'> & {
  kind: 'typing';
  data: {
    observationClockId: string;
    captureSegment: number;
    eventCount: number;
    eventType: string;
    lastEventTimeMs: number;
    targetDescription?: Record<string, string>;
  };
};

export type KeyboardHeldState = {
  action: RecordingTelemetrySnapshot['actionEvents'][number] | null;
  onset: number;
  repeats: number[];
  repeatCount: number;
  lastObservedTime: number;
};

export type TelemetryState = {
  observationClock: ReturnType<typeof import('./observation-clock').createObservationClock>;
  recordingId: string | null;
  frameClock:
    | import('../../../contracts/video/recording-frame-clock').RecordingFrameClockAnchor
    | null
    | undefined;
  clockRevision: number;
  observationAvailable: boolean;
  mediaResumeEstimateSeconds: number;
  gestures: Map<
    number,
    {
      action: RecordingTelemetrySnapshot['actionEvents'][number];
      pointerId: number | null;
      downTimestampMs: number;
      target: Element | null;
    }
  >;
  keyboard: {
    held: Map<string, KeyboardHeldState>;
    modifiers: { label: string; downTime: number; consumed: boolean } | null;
    target: Element | null;
    times: number[];
    repeats: number[];
  };
  captureSegment: number;
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
  /** Disposable target identity; never serialized into telemetry. */
  typingTarget: Element | null;
  viewportObservation: RecordingTelemetrySnapshot['viewportObservation'];
  viewportObserver: (() => void) | null;
  viewport: RecordingTelemetrySnapshot['viewport'];
};
