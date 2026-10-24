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
  expect(host.querySelector('input[type="text"]')?.getAttribute('value')).toBe('#FF0000');
  expect(host.querySelector('input[type="number"]')?.getAttribute('value')).toBe('50');
  act(() => root.unmount());
  host.remove();
});

it('keeps the compact variant to the plane and stacked sliders', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <ColorEditorPanel
        compact
        color="#12345680"
        formatMode="rgb"
        eyedropper={{
          eyedropperAvailable: true,
          eyedropperPressed: false,
          handleEyedropperPick: async () => undefined,
        }}
        onColorChange={() => undefined}
        onCycleFormatMode={() => undefined}
        onSelectTransparent={() => undefined}
      />
    )
  );
  expect(host.querySelectorAll('input[type="range"]')).toHaveLength(2);
  expect(host.querySelectorAll('input[type="number"]')).toHaveLength(1);
  expect(host.querySelector('[data-ui="shared.ui.color-selector.mode-label-row"]')).toBeNull();
  expect(host.querySelector('.sniptale-color-plane-ring')).not.toBeNull();
  expect(host.querySelectorAll('circle[stroke="#000"]')).toHaveLength(0);
  act(() => root.unmount());
  host.remove();
});
