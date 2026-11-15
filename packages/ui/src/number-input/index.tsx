import { forwardRef, useCallback, useRef, type InputHTMLAttributes, type Ref } from 'react';
import { attachNumericInputWheel, stepNativeNumberInput, type NumericStepDirection } from './wheel';

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
