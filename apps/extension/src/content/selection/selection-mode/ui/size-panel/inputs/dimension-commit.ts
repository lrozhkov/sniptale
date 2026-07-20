import type { DimensionInputBindingArgs } from './types';

function bindEnterCommit(input: HTMLInputElement, commitInputValue: () => void): void {
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    commitInputValue();
  });
}

export function bindDimensionInput({
  input,
  pairedInput,
  maxValue,
  minSelectionSize,
  getSelection,
  getCurrentValue,
  getShouldSyncPairedInput,
  getPairedValue,
  apply,
  syncSelection,
}: DimensionInputBindingArgs): void {
  const commit = (value: number, allowUnderMin: boolean): void => {
    const clampedValue = Math.min(value, maxValue);
    if (allowUnderMin && clampedValue < minSelectionSize) {
      return;
    }

    const nextValue = Math.min(Math.max(clampedValue, minSelectionSize), maxValue);
    input.value = Math.round(nextValue).toString();

    const selection = apply({ ...getSelection() }, nextValue);
    if (getShouldSyncPairedInput()) {
      pairedInput.value = Math.round(getPairedValue(selection)).toString();
    }
    syncSelection(selection);
  };

  input.addEventListener('input', () => {
    const inputValue = Number.parseInt(input.value, 10);
    if (!Number.isNaN(inputValue)) {
      commit(inputValue, true);
    }
  });

  const commitInputValue = (): void => {
    if (input.value.trim() === '') {
      input.value = Math.round(getCurrentValue(getSelection())).toString();
      return;
    }

    const inputValue = Number.parseInt(input.value, 10);
    commit(Number.isNaN(inputValue) ? minSelectionSize : inputValue, false);
  };

  input.addEventListener('blur', commitInputValue);
  bindEnterCommit(input, commitInputValue);
}
