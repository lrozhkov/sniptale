// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ArrowDrawDirectionOption,
  DrawingShapeFillOptions,
  DrawingTextBackgroundOptions,
} from './options';
import { CommandPressScope } from '@sniptale/ui/control-language/press';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['shape', DrawingShapeFillOptions, 'shape.fill-toggle', false],
  ['shape scoped', DrawingShapeFillOptions, 'shape.fill-toggle', true],
  ['text', DrawingTextBackgroundOptions, 'text.background-none', false],
  ['text scoped', DrawingTextBackgroundOptions, 'text.background-none', true],
] as const)(
  'keeps %s fill state, color and geometry when toggling or changing selection',
  (_kind, Control, suffix, scoped) => {
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
      act(() =>
        root.render(
          <CommandPressScope.Provider value={scoped}>
            <Harness color="#abcdef" />
          </CommandPressScope.Provider>
        )
      );
      expect(toggle().getAttribute('aria-pressed')).toBe('true');
      expect(toggle().classList.contains('sniptale-glass-toolbar-button--active')).toBe(!scoped);
      expect(toggle().hasAttribute('data-command-property')).toBe(scoped);
      const swatch = host.querySelector<HTMLButtonElement>('button[title="#123456"]')!;
      expect(swatch.style.backgroundColor).toBe('rgb(18, 52, 86)');
      expect(swatch.hasAttribute('data-command-property')).toBe(false);
      const sizeClasses = ['!h-7', '!w-7', '!min-h-7', '!min-w-7'];
      act(() => toggle().click());
      expect(changes).toHaveBeenLastCalledWith(null);
      expect(toggle().disabled).toBe(false);
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
      expect(toggle().classList.contains('!border-transparent')).toBe(!scoped);
      expect(toggle().querySelector('.lucide-paint-bucket')).not.toBeNull();
      for (const size of sizeClasses) expect(toggle().classList.contains(size)).toBe(true);
      act(() => toggle().click());
      expect(changes).toHaveBeenLastCalledWith('#abcdef');
      act(() => host.querySelector<HTMLButtonElement>('button[title="#123456"]')!.click());
      act(() => toggle().click());
      act(() => toggle().click());
      expect(changes).toHaveBeenLastCalledWith('#123456');
      act(() =>
        root.render(
          <CommandPressScope.Provider value={scoped}>
            <Harness key="other-object" color="#654321" />
          </CommandPressScope.Provider>
        )
      );
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

it.each([false, true])('preserves arrow direction toggle in scoped=%s consumers', (scoped) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  try {
    for (const active of [false, true]) {
      act(() =>
        root.render(
          <CommandPressScope.Provider value={scoped}>
            <ArrowDrawDirectionOption
              active={active}
              dataUi="test.arrow-direction"
              onChange={onChange}
            />
          </CommandPressScope.Provider>
        )
      );
      const button = host.querySelector<HTMLButtonElement>('button')!;
      expect(button.getAttribute('aria-pressed')).toBe(String(active));
      expect(
        button.querySelector(active ? '.lucide-arrow-down-to-dot' : '.lucide-arrow-up-from-dot')
      ).not.toBeNull();
      expect(button.getAttribute('title')).toBe('editor.compact.arrowDrawFromTip');
      expect(button.hasAttribute('data-command-property')).toBe(scoped);
      expect(button.classList.contains('sniptale-glass-toolbar-button--active')).toBe(
        active && !scoped
      );
      act(() => button.click());
      expect(onChange).toHaveBeenLastCalledWith(!active);
    }
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
