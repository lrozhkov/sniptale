import { describeTelemetryTarget } from './target';
import type { RecordingActionEvent } from '../../../features/video/project/types';
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
  private readonly released = new Map<
    number,
    { action: RecordingActionEvent; target: Element | null }
  >();
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
    state.actionEvents.push(action);
    state.gestures.set(event.button, {
      action,
      downTimestampMs: event.timeStamp,
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
    released.set(event.button, { action, target: gesture.target });
  };
  lose = (completion: 'lost' | 'cancelled', timestamp: number, retainNative = false) => {
    const { state } = this;
    for (const [button, { action }] of state.gestures) {
      action.data['lastObservedTime'] = elapsed(state, timestamp);
      if (retainNative && action.data['gestureType'] === 'native-drag') continue;
      action.data['completion'] = completion;
      state.gestures.delete(button);
    }
  };
  click = (event: MouseEvent) => {
    const { released } = this;
    if (!event.isTrusted || event.detail < 1) return;
    const completed = released.get(event.button);
    if (!completed) return;
    const target = describeTelemetryTarget(event);
    if ((target.clickElement ?? target.element) !== completed.target) return;
    released.delete(event.button);
    completed.action.data['clickCount'] = event.detail;
  };
  cancel = (event: MouseEvent) => {
    const { state } = this;
    if (!event.isTrusted) return;
    for (const [button, { action, pointerId }] of state.gestures) {
      if ('pointerId' in event && pointerId !== null && event.pointerId !== pointerId) continue;
      if (action.data['gestureType'] === 'native-drag') {
        action.data['pointerCancelled'] = true;
        continue;
      }
      action.data['completion'] = 'cancelled';
      action.data['lastObservedTime'] = elapsed(state, event.timeStamp);
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
    }
  };
  dragEnd = (event: DragEvent) => {
    const { state } = this;
    if (!event.isTrusted) return;
    for (const [button, { action }] of state.gestures) {
      if (action.data['gestureType'] !== 'native-drag') continue;
      action.data['completion'] = 'semantic';
      action.data['semanticEndTime'] = elapsed(state, event.timeStamp);
      state.gestures.delete(button);
    }
  };
  drop = (event: DragEvent) => {
    const { state } = this;
    if (!event.isTrusted) return;
    for (const { action } of state.gestures.values())
      if (action.data['gestureType'] === 'native-drag') action.data['dropObserved'] = true;
  };
  selectionChange = (event: Event) => {
    const { state } = this;
    if (!event.isTrusted) return;
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) return;
    for (const { action, target } of state.gestures.values()) {
      if (action.data['gestureType'] === 'native-drag' || action.data['button'] !== 0) continue;
      const anchor = selection.anchorNode;
      if (target && anchor && (target.contains(anchor) || anchor.parentElement?.contains(target)))
        action.data['gestureType'] = 'selection';
    }
  };
  controlInput = (event: Event) => {
    const { state } = this;
    if (!event.isTrusted) return;
    const target = describeTelemetryTarget(event).element;
    if (!(target instanceof HTMLInputElement) || target.type !== 'range') return;
    for (const gesture of state.gestures.values())
      if (gesture.target === target) gesture.action.data['gestureType'] = 'drag';
  };
}
