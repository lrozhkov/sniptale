// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { FrameApplyButton } from './apply-button';

it('renders the full-width apply action without a cancel button', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onApplyFrame = vi.fn();
  act(() => root.render(<FrameApplyButton onApplyFrame={onApplyFrame} />));
  const button = container.querySelector('button');
  expect(container.querySelectorAll('button')).toHaveLength(1);
  expect(button?.className).toContain('w-full');
  act(() => button?.click());

  expect(onApplyFrame).toHaveBeenCalledOnce();
  act(() => root.unmount());
});
