// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { TimelineIconButton } from './icon-button';

it('preserves its focused trigger while opening a dependent surface', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let opener: Element | null = null;
  try {
    act(() =>
      root.render(
        <TimelineIconButton
          title="Record"
          icon={null}
          onClick={() => {
            opener = document.activeElement;
          }}
        />
      )
    );
    const button = host.querySelector('button')!;
    button.focus();
    act(() => button.click());
    expect(opener).toBe(button);
    expect(document.activeElement).toBe(button);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('keeps fit commands distinct from persistent lane modes in the command scope', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <CommandPressScope value={true}>
          <TimelineIconButton title="Fit project" icon={null} onClick={() => {}} />
          <TimelineIconButton title="Track lock" active icon={null} onClick={() => {}} />
        </CommandPressScope>
      )
    );
    const [fit, mode] = host.querySelectorAll('button');
    expect(fit?.dataset['commandIcon']).toBe('utility');
    expect(fit?.hasAttribute('aria-pressed')).toBe(false);
    expect(mode?.dataset['commandIcon']).toBe('tool');
    expect(mode?.getAttribute('aria-pressed')).toBe('true');
    expect(fit?.hasAttribute('data-command-tone')).toBe(false);
    expect(mode?.hasAttribute('data-command-tone')).toBe(false);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
