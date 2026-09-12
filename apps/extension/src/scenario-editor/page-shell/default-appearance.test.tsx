// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideDefaultAppearance } from './default-appearance';
let host: HTMLDivElement;
let opener: HTMLButtonElement;
let root: Root;
const apply = vi.fn();
const style = createGuideProject('Guide').style;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  opener = document.createElement('button');
  document.body.append(opener, host);
  opener.focus();
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  opener.remove();
  vi.unstubAllGlobals();
});
async function render(disabled = false) {
  await act(async () =>
    root.render(
      <GuideDefaultAppearance
        style={style}
        disabled={disabled}
        onApply={apply}
        onClose={() => root.render(null)}
        t={createTranslator('en')}
      />
    )
  );
}
function button(name: string) {
  const node = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (node) => (node.getAttribute('aria-label') ?? node.textContent) === name
  );
  if (!node) throw new Error(`Missing ${name}`);
  return node;
}
it('keeps a private draft, applies once with explicit reset and restores focus', async () => {
  await render();
  await act(async () => button('Serif').click());
  expect(apply).not.toHaveBeenCalled();
  const reset = document.querySelector<HTMLInputElement>('[role="dialog"] input[type="checkbox"]')!;
  await act(async () => reset.click());
  await act(async () => button('Apply').click());
  expect(apply).toHaveBeenCalledExactlyOnceWith({ ...style, font: 'serif' }, true);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
});
it('discards edits on Escape and keeps keyboard focus inside the dialog', async () => {
  await render();
  const first = document.activeElement;
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    )
  );
  expect(document.activeElement).toBe(button('Apply'));
  await act(async () =>
    button('Apply').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    )
  );
  expect(document.activeElement).toBe(first);
  await act(async () => button('Serif').click());
  await act(async () =>
    button('Apply').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(apply).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(opener);
});
it('keeps cancellation available while applying is disabled', async () => {
  await render(true);
  expect(button('Apply').disabled).toBe(true);
  await act(async () => button('Apply').click());
  expect(apply).not.toHaveBeenCalled();
  await act(async () => button('Cancel').click());
  expect(document.activeElement).toBe(opener);
});
