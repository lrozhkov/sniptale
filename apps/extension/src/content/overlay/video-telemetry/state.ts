import type { RecordingTelemetrySnapshot } from '../../../contracts/messaging/contracts/response-types';
import { tickCursorIdleTelemetry } from './signals';
import { createTelemetryListeners } from './events';
import type { TelemetryState } from './types';

export function createInitialState(): TelemetryState {
  return {
    accumulatedDurationMs: 0,
    actionEvents: [],
    cursorIdleSignal: null,
    cursorTrack: null,
    idleTimerId: null,
    isEnabled: false,
    isPaused: false,
    lastKnownPointerPosition: null,
    lastSampleTimeMs: -1,
    listeners: null,
    pointerMoveEventName: 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove',
    pointerStationaryPosition: null,
    pointerStationaryStartedAtMs: null,
    segmentStartedAtTimestamp: 0,
    signals: [],
    typingSignal: null,
    viewport: null,
  };
}

export function buildViewportSnapshot(): RecordingTelemetrySnapshot['viewport'] {
  const outerWidth = Math.max(window.innerWidth, window.outerWidth || 0);
  const outerHeight = Math.max(window.innerHeight, window.outerHeight || 0);
  const chromeWidth = Math.max(0, outerWidth - window.innerWidth);
  const viewportOffsetX = Math.round(chromeWidth / 2);
  const viewportOffsetY = Math.max(
    0,
    Math.round(outerHeight - window.innerHeight - viewportOffsetX)
  );

  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio,
    outerWidth,
    outerHeight,
    viewportOffsetX,
    viewportOffsetY,
  };
}

export function removeListeners(state: TelemetryState): void {
  if (state.idleTimerId !== null) {
    window.clearInterval(state.idleTimerId);
    state.idleTimerId = null;
  }
  if (!state.listeners) {
    return;
  }

  document.removeEventListener('pointermove', state.listeners.pointerMove, true);
  document.removeEventListener('pointerrawupdate', state.listeners.pointerMove, true);
  document.removeEventListener('pointerdown', state.listeners.pointerDown, true);
  document.removeEventListener('click', state.listeners.click, true);
  document.removeEventListener('keydown', state.listeners.keyDown, true);
  document.removeEventListener('input', state.listeners.input, true);
  document.removeEventListener('change', state.listeners.change, true);
  window.removeEventListener('scroll', state.listeners.scroll, true);
  document.removeEventListener('visibilitychange', state.listeners.visibilityChange, true);
  state.listeners = null;
}

export function resetTelemetryState(
  state: TelemetryState,
  recordingId: string | null,
  offsetSeconds = 0
): void {
  state.accumulatedDurationMs = Math.max(0, offsetSeconds * 1000);
  state.actionEvents = [];
  state.cursorIdleSignal = null;
  state.cursorTrack = null;
  state.idleTimerId = null;
  state.isEnabled = recordingId !== null;
  state.isPaused = false;
  state.lastKnownPointerPosition = null;
  state.lastSampleTimeMs = -1;
  state.pointerStationaryPosition = null;
  state.pointerStationaryStartedAtMs = null;
  state.segmentStartedAtTimestamp = performance.now();
  state.signals = [];
  state.typingSignal = null;
  state.viewport = buildViewportSnapshot();
}

export function attachListeners(state: TelemetryState): void {
  state.listeners = createTelemetryListeners(state);
  document.addEventListener(state.pointerMoveEventName, state.listeners.pointerMove, true);
  document.addEventListener('pointerdown', state.listeners.pointerDown, true);
  document.addEventListener('click', state.listeners.click, true);
  document.addEventListener('keydown', state.listeners.keyDown, true);
  document.addEventListener('input', state.listeners.input, true);
  document.addEventListener('change', state.listeners.change, true);
  window.addEventListener('scroll', state.listeners.scroll, true);
  document.addEventListener('visibilitychange', state.listeners.visibilityChange, true);
  state.idleTimerId = window.setInterval(() => tickCursorIdleTelemetry(state), 250);
}
