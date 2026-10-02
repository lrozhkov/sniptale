// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { DrawingShapeFillOptions, DrawingTextBackgroundOptions } from './options';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['shape', DrawingShapeFillOptions, 'shape.fill-toggle'],
  ['text', DrawingTextBackgroundOptions, 'text.background-none'],
] as const)(
  'keeps %s fill state, color and geometry when toggling or changing selection',
  (_kind, Control, suffix) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const changes = vi.fn();
    function Harness({ color }: { color: string }) {
      const [value, setValue] = useState<string | null>(color);
      return (
        <Control
          colors={['#abcdef', '#123456']}
          floatingBoundaryRef={{ current: host }}
          floatingPlacement="auto"
          value={value}
          vertical={false}
          onChange={(next) => {
            changes(next);
            setValue(next);
          }}
        />
      );
    }
    const toggle = () =>
      host.querySelector<HTMLButtonElement>(
        `[data-ui="content.toolbar.drawing-options.${suffix}"]`
      )!;
    try {
      act(() => root.render(<Harness color="#abcdef" />));
      expect(toggle().getAttribute('aria-pressed')).toBe('true');
      expect(toggle().classList.contains('sniptale-glass-toolbar-button--active')).toBe(true);
      const sizeClasses = ['!h-7', '!w-7', '!min-h-7', '!min-w-7'];
      act(() => toggle().click());
      expect(changes).toHaveBeenLastCalledWith(null);
      expect(toggle().disabled).toBe(false);
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
      expect(toggle().classList.contains('!border-transparent')).toBe(true);
      expect(toggle().querySelector('.lucide-paint-bucket')).not.toBeNull();
      for (const size of sizeClasses) expect(toggle().classList.contains(size)).toBe(true);
      act(() => toggle().click());
      expect(changes).toHaveBeenLastCalledWith('#abcdef');
      act(() => host.querySelector<HTMLButtonElement>('button[title="#123456"]')!.click());
      act(() => toggle().click());
      act(() => toggle().click());
      expect(changes).toHaveBeenLastCalledWith('#123456');
      act(() => root.render(<Harness key="other-object" color="#654321" />));
      act(() => toggle().click());
      act(() => toggle().click());
      expect(changes).toHaveBeenLastCalledWith('#654321');
      for (const size of sizeClasses) expect(toggle().classList.contains(size)).toBe(true);
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  }
);
