// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ColorEditorPanel } from './editor-panel';

it('is body-only and resynchronizes when the selected stop changes', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const props = {
    formatMode: 'hex' as const,
    eyedropper: {
      eyedropperAvailable: false,
      eyedropperPressed: false,
      handleEyedropperPick: vi.fn(async () => undefined),
    },
    onColorChange: vi.fn(),
    onCycleFormatMode: vi.fn(),
    onSelectTransparent: vi.fn(),
  };
  act(() => root.render(<ColorEditorPanel {...props} color="#111111ff" />));
  expect(host.querySelector('[data-ui="shared.ui.color-selector.editor-panel"]')).not.toBeNull();
  expect(host.textContent).not.toContain('Apply');
  act(() => root.render(<ColorEditorPanel {...props} color="#ff000080" />));
  expect(host.innerHTML).toContain('80');
  act(() => root.unmount());
  host.remove();
});
