export type NumericStepDirection = 1 | -1;

/** Consume the shared Alt+wheel gesture after the receiving control checks focus. */
export function consumeNumericWheelStep(event: WheelEvent): NumericStepDirection | null {
  if (
    event.defaultPrevented ||
    !event.cancelable ||
    !event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.deltaY === 0 ||
    Math.abs(event.deltaX) >= Math.abs(event.deltaY)
  )
    return null;
  event.preventDefault();
  event.stopPropagation();
  return event.deltaY < 0 ? 1 : -1;
}

/** Bind only an owned numeric control, before ancestor wheel containment. */
export function attachNumericInputWheel(
  input: HTMLInputElement,
  onStep: (direction: NumericStepDirection) => void
): () => void {
  const handleWheel = (event: WheelEvent) => {
    const root = input.getRootNode();
    if (
      !input.isConnected ||
      !('activeElement' in root) ||
      root.activeElement !== input ||
      event.target !== input ||
      input.disabled ||
      input.readOnly
    )
      return;

    const step = consumeNumericWheelStep(event);
    if (step !== null) onStep(step);
  };
  input.addEventListener('wheel', handleWheel, { passive: false });
  return () => input.removeEventListener('wheel', handleWheel);
}

/** Match native spin input/change delivery without accepting a separate product value. */
export function stepNativeNumberInput(input: HTMLInputElement, direction: NumericStepDirection) {
  if (input.type !== 'number') return;
  const before = input.value;
  if (input.step.toLowerCase() === 'any') stepUnrestrictedNumberInput(input, direction);
  else applyNativeStep(input, direction);
  if (input.value === before) return;

  const EventConstructor = input.ownerDocument.defaultView?.Event ?? Event;
  input.dispatchEvent(new EventConstructor('input', { bubbles: true, composed: true }));
  input.dispatchEvent(new EventConstructor('change', { bubbles: true, composed: true }));
}

function stepUnrestrictedNumberInput(input: HTMLInputElement, direction: NumericStepDirection) {
  const view = input.ownerDocument.defaultView;
  if (!view) return;
  const probe = input.cloneNode(false);
  if (!(probe instanceof view.HTMLInputElement)) return;
  probe.removeAttribute('min');
  probe.removeAttribute('max');
  probe.step = '1';
  probe.defaultValue = input.value;
  probe.value = input.value;
  applyNativeStep(probe, direction);
  let next = probe.valueAsNumber;
  if (!Number.isFinite(next)) return;

  probe.value = input.min;
  const min = probe.valueAsNumber;
  probe.value = input.max;
  const max = probe.valueAsNumber;
  if (Number.isFinite(min) && Number.isFinite(max) && min > max) return;
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);

  // The native setter leaves React's change tracker able to observe the input event.
  const setValue = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')?.set;
  setValue?.call(input, String(next));
}

function applyNativeStep(input: HTMLInputElement, direction: NumericStepDirection) {
  if (direction > 0) input.stepUp();
  else input.stepDown();
}
