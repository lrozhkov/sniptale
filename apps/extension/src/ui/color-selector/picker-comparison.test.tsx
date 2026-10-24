// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PickerComparison } from './picker-comparison';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('restores the original and keeps failed clipboard copy selectable', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  let rejectCopy: ((reason: Error) => void) | undefined;
  const writeText = vi.fn(
    () =>
      new Promise<void>((_, reject) => {
        rejectCopy = reject;
      })
  );
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  act(() =>
    root.render(
      <PickerComparison originalColor="#12345680" color="#abcdef40" onColorChange={onChange} />
    )
  );
  const buttons = host.querySelectorAll('button');
  act(() => buttons[0]!.click());
  expect(onChange).toHaveBeenCalledWith('#12345680');
  await act(async () => buttons[1]!.click());
  expect(writeText).toHaveBeenCalledWith('#ABCDEF40');
  expect(buttons[1]!.disabled).toBe(false);
  expect(buttons[1]!.getAttribute('aria-busy')).toBe('true');
  await act(async () => rejectCopy!(new Error('denied')));
  expect(host.querySelector('input')?.value).toBe('#ABCDEF40');
  expect(host.querySelector('input')?.readOnly).toBe(true);
  act(() => host.querySelector('input')?.focus());
  expect(host.querySelector('input')?.selectionStart).toBe(0);
  expect(host.querySelector('input')?.selectionEnd).toBe(9);
  act(() => root.unmount());
  host.remove();
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.unstubAllGlobals();
});

it('copies full opaque RGBA once while pending and resets feedback when the color changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let resolveCopy: (() => void) | undefined;
  const writeText = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveCopy = resolve;
      })
  );
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const render = (color: string) =>
    act(() =>
      root.render(
        <PickerComparison originalColor="#12345680" color={color} onColorChange={() => undefined} />
      )
    );
  render('#abcdef');
  const copy = host.querySelectorAll('button')[1]!;
  await act(async () => {
    copy.click();
    copy.click();
  });
  expect(writeText).toHaveBeenCalledOnce();
  expect(writeText).toHaveBeenCalledWith('#ABCDEFFF');
  await act(async () => resolveCopy!());
  expect(copy.getAttribute('aria-busy')).toBe('false');
  expect(host.querySelector('.lucide-check')).not.toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).toBe('shared.ui.colorSelectorCopied');
  render('#12345680');
  expect(host.querySelector('.lucide-check')).toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).toBe('');
  act(() => root.unmount());
  host.remove();
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.unstubAllGlobals();
});

it('does not attach completion feedback to a different color after an async copy', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let settle: (() => void) | undefined;
  const writeText = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      })
  );
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const render = (color: string) =>
    act(() =>
      root.render(
        <PickerComparison originalColor="#12345680" color={color} onColorChange={() => undefined} />
      )
    );
  render('#abcdef40');
  await act(async () => host.querySelectorAll('button')[1]!.click());
  render('#abcdef80');
  await act(async () => settle!());
  expect(host.querySelector('.lucide-check')).toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).toBe('');
  expect(host.querySelector('input')).toBeNull();
  act(() => root.unmount());
  host.remove();
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.unstubAllGlobals();
});
