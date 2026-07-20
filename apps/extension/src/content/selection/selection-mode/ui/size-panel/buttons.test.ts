// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bindAdjustmentButtons } from './buttons';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('selection-mode size-panel buttons', () => {
  it('routes minus and plus buttons to width and height adjustment callbacks', () => {
    const sizePanel = document.createElement('div');
    const minusWidth = document.createElement('button');
    minusWidth.className = 'sniptale-size-btn-minus';
    minusWidth.dataset['target'] = 'width';
    const plusHeight = document.createElement('button');
    plusHeight.className = 'sniptale-size-btn-plus';
    plusHeight.dataset['target'] = 'height';
    sizePanel.append(minusWidth, plusHeight);
    const adjustSize = vi.fn();

    bindAdjustmentButtons(sizePanel, adjustSize, 10);

    minusWidth.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    plusHeight.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(adjustSize).toHaveBeenNthCalledWith(1, 'width', -10);
    expect(adjustSize).toHaveBeenNthCalledWith(2, 'height', 10);
  });
});
