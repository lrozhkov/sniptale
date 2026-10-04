// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { TablerIcon } from './tabler-icon';

it('does not rebuild unchanged SVG markup when the editor rerenders', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (opacity: number, icon: 'tabler:blur' | 'tabler:lock' = 'tabler:blur') => {
    act(() => {
      root.render(<TablerIcon icon={icon} style={{ opacity }} />);
    });
  };

  try {
    render(0.5);
    const blurMarkup = container.querySelector('svg')?.innerHTML;
    const innerHtmlWrites = vi.spyOn(Element.prototype, 'innerHTML', 'set');
    try {
      render(0.5);
      render(0.5);
      expect(innerHtmlWrites).not.toHaveBeenCalled();

      render(0.75);
      expect(container.querySelector('svg')?.style.opacity).toBe('0.75');
      render(0.75, 'tabler:lock');
      expect(container.querySelector('svg')?.innerHTML).not.toBe(blurMarkup);
    } finally {
      innerHtmlWrites.mockRestore();
    }
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
