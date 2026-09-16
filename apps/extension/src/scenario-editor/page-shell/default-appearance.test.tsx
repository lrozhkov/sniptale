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
        t={createTranslator('en')}
      />
    )
  );
}
function button(name: string) {
  const node = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => (node.getAttribute('aria-label') ?? node.textContent) === name
  );
  if (!node) throw new Error(`Missing ${name}`);
  return node;
}
it('updates defaults immediately and resets all steps only on the explicit action', async () => {
  await render();
  await act(async () => button('Serif').click());
  expect(apply).toHaveBeenCalledExactlyOnceWith({ ...style, font: 'serif' }, false);
  await act(async () => button('Apply to all steps').click());
  expect(apply).toHaveBeenLastCalledWith(style, true);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
});
it('does not mutate defaults while disabled', async () => {
  await render(true);
  await act(async () => button('Serif').click());
  await act(async () => button('Apply to all steps').click());
  expect(apply).not.toHaveBeenCalled();
});
it('renders document appearance inline without a modal or focus trap', async () => {
  await render();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.textContent).toContain('Entire guide');
  expect(document.activeElement).toBe(opener);
});
