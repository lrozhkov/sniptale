import { RECORDING_EVENT_LABELS } from '../../../features/video/project/recording-events/types';
import { describeTelemetryTarget } from './target';
import type { RecordingActionEvent } from '../../../features/video/project/types';
import type { RecordingViewportGeometry } from '../../../features/video/project/types';
import type { TelemetryState } from './types';

const RECORDING_DRAG_THRESHOLD_CSS_PX = 12;
const RECORDING_HOLD_THRESHOLD_SECONDS = 0.5;

function elapsed(state: TelemetryState, timeStamp: number): number {
  return (state.accumulatedDurationMs + timeStamp - state.segmentStartedAtTimestamp) / 1000;
}

function modifiers(event: MouseEvent) {
  return {
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
  };
}

/** Owns delivered button edges. Native semantic completion never substitutes for a physical up. */
export function createPointerGestureRecorder(state: TelemetryState) {
  return new PointerGestureRecorder(state);
}

class PointerGestureRecorder {
  private readonly targets = new WeakMap<Element, string>();
  private get released() {
    return this.state.releasedGestures;
  }
  constructor(private readonly state: TelemetryState) {}
  down = (event: MouseEvent) => {
    const { state, targets, released } = this;
    if (
      !event.isTrusted ||
      !Number.isInteger(event.button) ||
      event.button < 0 ||
      event.button > 31 ||
      state.gestures.has(event.button)
    )
      return;
    const previous = released.get(event.button);
    if (previous) this.emit(previous);
    released.delete(event.button);
    const target = describeTelemetryTarget(event);
    const element = target.clickElement ?? target.element;
    let targetId = element ? targets.get(element) : undefined;
    if (element && !targetId) {
      targetId = crypto.randomUUID();
      targets.set(element, targetId);
    }
    const time = elapsed(state, event.timeStamp);
    if (!Number.isFinite(time) || time < 0) return;
    const id = crypto.randomUUID();
    const action: RecordingActionEvent = {
      id,
      kind: 'CLICK' as const,
      time,
      duration: 0.45,
      point: { x: event.clientX, y: event.clientY },
      label: target.data['targetName'] ?? '',
      data: {
        ...target.data,
        ...(targetId ? { targetId } : {}),
        gestureId: id,
        gestureType: 'hold',
        button: event.button,
        downTime: time,
        lastObservedTime: time,
        downX: event.clientX,
        downY: event.clientY,
        maxExcursionCssPx: 0,
        completion: 'lost',
        observationClockId: state.observationClock.id,
        captureSegment: state.captureSegment,
        ...modifiers(event),
      },
      preset: 'CLICK_PRESS' as const,
    };
    if (!state.eventSource) state.actionEvents.push(action);
    state.gestures.set(event.button, {
      action,
      downTimestampMs: event.timeStamp,
      viewport: viewport(),
      sourceClockId: state.observationClock.id,
      target: element,
      pointerId:
        'pointerId' in event && typeof event.pointerId === 'number' ? event.pointerId : null,
    });
    if (state.keyboard.modifiers) state.keyboard.modifiers.consumed = true;
  };
  move = (event: MouseEvent) => {
    const { state } = this;
    if (!event.isTrusted) return;
    for (const { action } of state.gestures.values()) {
      const dx = event.clientX - Number(action.data['downX']);
      const dy = event.clientY - Number(action.data['downY']);
      const excursion = Math.max(Number(action.data['maxExcursionCssPx']), Math.hypot(dx, dy));
      action.data['maxExcursionCssPx'] = excursion;
      if (excursion >= RECORDING_DRAG_THRESHOLD_CSS_PX && action.data['gestureType'] === 'hold')
        action.data['gestureType'] = 'drag';
      action.data['lastObservedTime'] = elapsed(state, event.timeStamp);
    }
  };
  up = (event: MouseEvent) => {
    const { state, released } = this;
    if (!event.isTrusted) return;
    const gesture = state.gestures.get(event.button);
    if (!gesture) return;
    this.move(event);
    const action = gesture.action;
    const upTime = elapsed(state, event.timeStamp);
    action.data['upTime'] = upTime;
    action.data['pressDuration'] = Math.max(0, (event.timeStamp - gesture.downTimestampMs) / 1000);
    action.data['upX'] = event.clientX;
    action.data['upY'] = event.clientY;
    action.data['completion'] = 'released';
    if (
      action.data['gestureType'] === 'hold' &&
      Number(action.data['pressDuration']) < RECORDING_HOLD_THRESHOLD_SECONDS
    ) {
      action.data['gestureType'] = 'click';
      action.preset = 'CLICK_RIPPLE';
    }
    state.gestures.delete(event.button);
    released.set(event.button, {
      action,
      target: gesture.target,
      viewport: gesture.viewport,
      upViewport: viewport(),
      sourceClockId: gesture.sourceClockId,
    });
  };
  lose = (completion: 'lost' | 'cancelled', retainNative = false) => {
    const { state } = this;
    for (const [button, gesture] of state.gestures) {
      const { action } = gesture;
      if (retainNative && action.data['gestureType'] === 'native-drag') continue;
      action.data['completion'] = completion;
      this.emit(gesture);
      state.gestures.delete(button);
    }
    for (const completed of this.released.values()) this.emit(completed);
    this.released.clear();
  };
  click = (event: MouseEvent) => {
    const { released } = this;
    if (!event.isTrusted || event.type !== 'click') return;
    const completed = released.get(event.button);
    if (!completed) {
      if (this.state.eventSource) this.emitSemantic(event);
      return;
    }
    if (event.detail < 1) return;
    const target = describeTelemetryTarget(event);
    if ((target.clickElement ?? target.element) !== completed.target) return;
    released.delete(event.button);
    completed.action.data['clickCount'] = event.detail;
    this.emit(completed);
  };
  cancel = (event: MouseEvent) => {
    const { state } = this;
    if (!event.isTrusted) return;
    for (const [button, gesture] of state.gestures) {
      const { action, pointerId } = gesture;
      if ('pointerId' in event && pointerId !== null && event.pointerId !== pointerId) continue;
      action.data['lastObservedTime'] = elapsed(state, event.timeStamp);
      if (action.data['gestureType'] === 'native-drag') {
        action.data['pointerCancelled'] = true;
        continue;
      }
      action.data['completion'] = 'cancelled';
      action.data['lastObservedTime'] = elapsed(state, event.timeStamp);
      this.emit(gesture);
      state.gestures.delete(button);
    }
  };
  dragStart = (event: DragEvent) => {
    const { state } = this;
    if (!event.isTrusted) return;
    const gesture = state.gestures.get(event.button);
    const target = describeTelemetryTarget(event).element;
    if (
      gesture &&
      target &&
      gesture.target &&
      (target === gesture.target || target.contains(gesture.target))
    ) {
      gesture.action.data['gestureType'] = 'native-drag';
      gesture.action.data['dragStartTime'] = elapsed(state, event.timeStamp);
      gesture.action.data['lastObservedTime'] = elapsed(state, event.timeStamp);
    }
  };
  dragEnd = (event: DragEvent) => {
    const { state } = this;
    if (!event.isTrusted) return;
    for (const [button, gesture] of state.gestures) {
      const { action } = gesture;
      if (action.data['gestureType'] !== 'native-drag') continue;
      action.data['completion'] = 'semantic';
      action.data['semanticEndTime'] = elapsed(state, event.timeStamp);
      action.data['lastObservedTime'] = elapsed(state, event.timeStamp);
      this.emit(gesture);
      state.gestures.delete(button);
    }
  };
  drop = (event: DragEvent) => {
    const { state } = this;
    if (!event.isTrusted) return;
    for (const { action } of state.gestures.values())
      if (action.data['gestureType'] === 'native-drag') {
        action.data['dropObserved'] = true;
        action.data['lastObservedTime'] = elapsed(state, event.timeStamp);
      }
  };
  selectionChange = (event: Event) => {
    const { state } = this;
    if (!event.isTrusted) return;
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) return;
    for (const { action, target } of state.gestures.values()) {
      if (action.data['gestureType'] === 'native-drag' || action.data['button'] !== 0) continue;
      const anchor = selection.anchorNode;
      if (target && anchor && (target.contains(anchor) || anchor.parentElement?.contains(target))) {
        action.data['gestureType'] = 'selection';
        action.data['lastObservedTime'] = elapsed(state, event.timeStamp);
      }
    }
  };
  controlInput = (event: Event) => {
    const { state } = this;
    if (!event.isTrusted) return;
    const target = describeTelemetryTarget(event).element;
    if (!(target instanceof HTMLInputElement) || target.type !== 'range') return;
    for (const gesture of state.gestures.values())
      if (gesture.target === target) {
        gesture.action.data['gestureType'] = 'drag';
        gesture.action.data['lastObservedTime'] = elapsed(state, event.timeStamp);
      }
  };
  private emit(gesture: {
    action: RecordingActionEvent;
    viewport: RecordingViewportGeometry;
    sourceClockId: string;
    upViewport?: RecordingViewportGeometry;
  }) {
    const source = this.state.eventSource;
    if (!source) return;
    const { action, viewport: geometry } = gesture;
    const data = action.data;
    const lastObservedTimeUs = microseconds(data['lastObservedTime']);
    const kind = data['gestureType'];
    const completion = data['completion'];
    const upTimeUs = microseconds(data['upTime']);
    const downTimeUs = microseconds(data['downTime']);
    const upViewport = gesture.upViewport;
    const sameGeometry =
      upViewport !== undefined &&
      Object.keys(geometry).every(
        (key) => Reflect.get(geometry, key) === Reflect.get(upViewport, key)
      );
    source.emit(
      {
        sourceClockId: gesture.sourceClockId,
        observationTimeSeconds: (lastObservedTimeUs ?? Math.round(action.time * 1000000)) / 1000000,
        viewport: geometry,
      },
      {
        kind: 'action',
        action: {
          id: action.id,
          kind: 'CLICK',
          timeUs: Math.round(action.time * 1000000),
          durationUs: 0,
          point: normalizedPoint(action.point?.x, action.point?.y, geometry),
          label: RECORDING_EVENT_LABELS.CLICK,
          preset: 'NONE',
          data: {
            button: typeof data['button'] === 'number' ? data['button'] : 0,
            gestureId: action.id,
            downTimeUs,
            upTimeUs,
            pressDurationUs:
              downTimeUs !== null && upTimeUs !== null ? upTimeUs - downTimeUs : null,
            lastObservedTimeUs,
            semanticEndTimeUs: microseconds(data['semanticEndTime']),
            dragStartTimeUs: microseconds(data['dragStartTime']),
            clickCount: typeof data['clickCount'] === 'number' ? data['clickCount'] : 1,
            gestureType:
              kind === 'click' ||
              kind === 'hold' ||
              kind === 'drag' ||
              kind === 'selection' ||
              kind === 'native-drag'
                ? kind
                : null,
            completion:
              completion === 'released' || completion === 'cancelled' || completion === 'semantic'
                ? completion
                : 'lost',
            pointerCancelled:
              typeof data['pointerCancelled'] === 'boolean' ? data['pointerCancelled'] : null,
            dropObserved: typeof data['dropObserved'] === 'boolean' ? data['dropObserved'] : null,
            upPoint: sameGeometry ? normalizedPoint(data['upX'], data['upY'], geometry) : null,
            ctrlKey: typeof data['ctrlKey'] === 'boolean' ? data['ctrlKey'] : null,
            altKey: typeof data['altKey'] === 'boolean' ? data['altKey'] : null,
            shiftKey: typeof data['shiftKey'] === 'boolean' ? data['shiftKey'] : null,
            metaKey: typeof data['metaKey'] === 'boolean' ? data['metaKey'] : null,
          },
        },
      }
    );
  }
  private emitSemantic(event: MouseEvent) {
    const time = elapsed(this.state, event.timeStamp);
    const id = crypto.randomUUID();
    this.emit({
      sourceClockId: this.state.observationClock.id,
      viewport: viewport(),
      action: {
        id,
        kind: 'CLICK',
        time,
        duration: 0,
        point: event.detail === 0 ? null : { x: event.clientX, y: event.clientY },
        label: RECORDING_EVENT_LABELS.CLICK,
        preset: 'NONE',
        data: {
          button: event.button,
          clickCount: Math.max(1, event.detail),
          gestureType: 'click',
          completion: 'semantic',
          semanticEndTime: time,
          lastObservedTime: time,
          ...modifiers(event),
        },
      },
    });
  }
}

function microseconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value * 1000000)
    : null;
}
function viewport(): RecordingViewportGeometry {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    visualViewportScale: window.visualViewport?.scale ?? 1,
    visualViewportOffsetX: window.visualViewport?.offsetLeft ?? 0,
    visualViewportOffsetY: window.visualViewport?.offsetTop ?? 0,
  };
}
function normalizedPoint(x: unknown, y: unknown, geometry: RecordingViewportGeometry) {
  return typeof x === 'number' &&
    typeof y === 'number' &&
    x >= 0 &&
    x <= geometry.width &&
    y >= 0 &&
    y <= geometry.height
    ? { x: x / geometry.width, y: y / geometry.height }
    : null;
}
