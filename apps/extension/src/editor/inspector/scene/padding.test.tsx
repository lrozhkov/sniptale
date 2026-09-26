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
