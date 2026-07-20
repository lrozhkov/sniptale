function bindAdjustmentButtonGroup(
  selector: string,
  sizePanel: HTMLElement,
  step: number,
  deltaSign: 1 | -1,
  adjustSize: (dimension: 'width' | 'height', delta: number) => void
) {
  sizePanel.querySelectorAll(selector).forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      adjustSize((button as HTMLElement).dataset['target'] as 'width' | 'height', deltaSign * step);
    });
  });
}

export function bindAdjustmentButtons(
  sizePanel: HTMLElement,
  adjustSize: (dimension: 'width' | 'height', delta: number) => void,
  step: number
) {
  bindAdjustmentButtonGroup('.sniptale-size-btn-minus', sizePanel, step, -1, adjustSize);
  bindAdjustmentButtonGroup('.sniptale-size-btn-plus', sizePanel, step, 1, adjustSize);
}
