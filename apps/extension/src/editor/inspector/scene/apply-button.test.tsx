// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { FrameApplyButton } from './apply-button';

it('renders apply alone or an explicit apply/cancel transaction', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onApplyFrame = vi.fn();
  const onCancelFrame = vi.fn();

  act(() => root.render(<FrameApplyButton onApplyFrame={onApplyFrame} />));
  expect(container.querySelectorAll('button')).toHaveLength(1);

  act(() =>
    root.render(<FrameApplyButton onApplyFrame={onApplyFrame} onCancelFrame={onCancelFrame} />)
  );
  const buttons = Array.from(container.querySelectorAll('button'));
  act(() => buttons.forEach((button) => button.click()));

  expect(onApplyFrame).toHaveBeenCalledOnce();
  expect(onCancelFrame).toHaveBeenCalledOnce();
  act(() => root.unmount());
});
