import {
  forwardRef,
  useCallback,
  useRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { attachNumericInputWheel, stepNativeNumberInput, type NumericStepDirection } from './wheel';

export { consumeNumericWheelStep } from './wheel';

/** Apply exact numeric entry keys while the caller owns its draft and dismissal policy. */
export function handleNumericEditorKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  editor: {
    step(direction: NumericStepDirection): void;
    commit(restoreFocus: boolean): void;
    close(restoreFocus: boolean): void;
  },
  stopEscapePropagation = false
) {
  if (event.nativeEvent.isComposing) return;
  if (
    (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  ) {
    event.preventDefault();
    editor.step(event.key === 'ArrowUp' ? 1 : -1);
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    editor.commit(true);
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (stopEscapePropagation) event.stopPropagation();
    editor.close(true);
  }
}

export interface NumberInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Retain the domain's existing step, draft, preview and commit operation. */
  onNumericStep?: ((direction: NumericStepDirection) => void) | undefined;
}

/** Unstyled input with focus-gated numeric wheel stepping; text requires an explicit domain step. */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { onNumericStep, type = 'number', ...props },
  forwardedRef
) {
  const currentStep = useRef(onNumericStep);
  currentStep.current = onNumericStep;
  const enabled = type === 'number' || onNumericStep !== undefined;
  const ref = useNumberInputRef(currentStep, enabled, forwardedRef);
  return <input {...props} type={type} ref={ref} />;
});

function useNumberInputRef(
  currentStep: { current: NumberInputProps['onNumericStep'] },
  enabled: boolean,
  forwardedRef: Ref<HTMLInputElement>
) {
  return useCallback(
    (input: HTMLInputElement | null) => {
      if (!input) return;
      const detach = enabled
        ? attachNumericInputWheel(input, (direction) => {
            const step = currentStep.current;
            if (step) step(direction);
            else stepNativeNumberInput(input, direction);
          })
        : undefined;
      const forwardedCleanup = typeof forwardedRef === 'function' ? forwardedRef(input) : undefined;
      if (forwardedRef && typeof forwardedRef !== 'function') forwardedRef.current = input;
      return () => {
        detach?.();
        if (typeof forwardedCleanup === 'function') forwardedCleanup();
        else if (typeof forwardedRef === 'function') forwardedRef(null);
        else if (forwardedRef?.current === input) forwardedRef.current = null;
      };
    },
    [currentStep, enabled, forwardedRef]
  );
}
