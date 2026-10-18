// @vitest-environment jsdom

import { act } from 'react';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { PreviewEffectRuntimeError } from './runtime-error';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

it('surfaces a localized preview failure and exposes an explicit retry action', () => {
  const onRetry = vi.fn();
  act(() => root?.render(<PreviewEffectRuntimeError onRetry={onRetry} />));

  const alert = container?.querySelector('[role="alert"]');
  const button = alert?.querySelector('button');
  expect(alert?.textContent).toContain('videoEditor.stage.effectRuntimeFailure');
  expect(button?.textContent).toContain('videoEditor.stage.effectRuntimeRetry');

  act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('cancels retry pressure without retrying and preserves the error until an explicit command', () => {
  const onRetry = vi.fn();
  act(() =>
    root?.render(
      <CommandPressScope value={true}>
        <PreviewEffectRuntimeError onRetry={onRetry} />
      </CommandPressScope>
    )
  );
  const button = container!.querySelector<HTMLButtonElement>('button')!;
  act(() => button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
  expect(button.getAttribute('data-pressing')).toBe('true');
  act(() => button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  act(() => button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })));
  expect(button.getAttribute('data-pressing')).toBeNull();
  expect(container!.querySelector('[role="alert"]')).not.toBeNull();
  expect(onRetry).not.toHaveBeenCalled();
  act(() => button.click());
  expect(onRetry).toHaveBeenCalledOnce();
});
