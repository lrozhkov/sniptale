const bridgedMouseEvents = new WeakSet<Event>();

type BridgedMouseEventType = 'click' | 'mousedown' | 'mousemove' | 'mouseup';

export function createBridgedMouseEvent(
  type: BridgedMouseEventType,
  source: Pick<
    MouseEvent,
    'button' | 'buttons' | 'clientX' | 'clientY' | 'ctrlKey' | 'metaKey' | 'shiftKey'
  >
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: type === 'mouseup' || type === 'click' ? 0 : source.button,
    buttons: type === 'mousedown' || type === 'mousemove' ? source.buttons : 0,
    cancelable: true,
    clientX: source.clientX,
    clientY: source.clientY,
    composed: false,
    ctrlKey: source.ctrlKey,
    metaKey: source.metaKey,
    shiftKey: source.shiftKey,
  });
  bridgedMouseEvents.add(event);
  return event;
}

export function isBridgedMouseEvent(event: Event): boolean {
  return bridgedMouseEvents.has(event);
}
