export interface CalloutHandleKeyboardEvent {
  ctrlKey?: boolean;
  key: string;
  shiftKey: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

export function getCalloutKeyboardDelta(event: CalloutHandleKeyboardEvent) {
  const step = event.shiftKey ? 10 : 5;
  switch (event.key) {
    case 'ArrowLeft':
      return { x: -step, y: 0 };
    case 'ArrowRight':
      return { x: step, y: 0 };
    case 'ArrowUp':
      return { x: 0, y: -step };
    case 'ArrowDown':
      return { x: 0, y: step };
    default:
      return null;
  }
}
