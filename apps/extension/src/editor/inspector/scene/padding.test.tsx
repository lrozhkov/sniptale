// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { FramePaddingSection } from './padding';

let container: HTMLDivElement;
let root: Root;
let current = DEFAULT_EDITOR_FRAME_SETTINGS;
function Harness() {
  const [frame, setFrame] = useState(DEFAULT_EDITOR_FRAME_SETTINGS);
  current = frame;
  return <FramePaddingSection frameDraft={frame} setFrameDraft={setFrame} />;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function enterValue(value: string) {
  const field = container.querySelector<HTMLInputElement>('input[type="text"]')!;
  await act(async () => {
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
}
it('keeps a full-width slider and supports manual padding above its common range', async () => {
  const range = container.querySelector<HTMLInputElement>('input[type="range"]')!;
  expect(range.max).toBe('256');
  expect(range.value).toBe('32');
  await enterValue('1024');
  expect(current).toMatchObject({
    paddingTop: 1024,
    paddingRight: 1024,
    paddingBottom: 1024,
    paddingLeft: 1024,
  });
  expect(range.value).toBe('256');
  await enterValue('-10');
  expect(current.paddingTop).toBe(0);
  await enterValue('9000');
  expect(current.paddingTop).toBe(4096);
  await enterValue('invalid');
  expect(current.paddingTop).toBe(4096);
});
it('offers four independently editable sides without short inline sliders', async () => {
  for (const name of ['all', 'vertical', 'horizontal']) {
    await act(async () =>
      container.querySelector<HTMLButtonElement>(`[data-padding-link="${name}"]`)?.click()
    );
  }
  expect(container.querySelectorAll('input[type="range"]')).toHaveLength(4);
  await enterValue('75');
  expect(current).toMatchObject({
    paddingTop: 75,
    paddingRight: 32,
    paddingBottom: 32,
    paddingLeft: 32,
  });
});

it('reveals only the hovered padding slider from its label and hides it on leave', async () => {
  const row = container.querySelector<HTMLElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-row"]'
  );
  expect(row?.dataset['rangeVisible']).toBe('false');
  const label = container.querySelector<HTMLElement>(
    '[data-ui="shared.linked-padding-fields"] > div:first-child span'
  );
  await act(async () => {
    label?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
  });
  expect(row?.dataset['rangeVisible']).toBe('true');
  await act(async () => {
    label?.dispatchEvent(
      new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body })
    );
  });
  expect(row?.dataset['rangeVisible']).toBe('false');
});

it('reveals just one side slider while unlinked padding labels are hovered', async () => {
  for (const name of ['all', 'vertical', 'horizontal']) {
    await act(async () =>
      container.querySelector<HTMLButtonElement>(`[data-padding-link="${name}"]`)?.click()
    );
  }
  const label = container.querySelector<HTMLElement>('span[data-padding-hover="top"]');
  await act(async () => {
    label?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
  });
  const rows = Array.from(
    container.querySelectorAll<HTMLElement>('[data-ui="shared.ui.compact-inspector.numeric-row"]')
  );
  expect(rows.map((row) => row.dataset['rangeVisible'])).toEqual([
    'true',
    'false',
    'false',
    'false',
  ]);
});

it('keeps the padding slider reachable after the numeric input receives keyboard focus', async () => {
  const input = container.querySelector<HTMLInputElement>('input[type="text"]')!;
  const range = container.querySelector<HTMLInputElement>('input[type="range"]')!;
  await act(async () => input.focus());
  expect(range.tabIndex).toBe(0);
  expect(
    range
      .closest('[data-ui="shared.ui.compact-inspector.numeric-row"]')
      ?.getAttribute('data-range-visible')
  ).toBe('true');
});
