// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTranslator } from '../../platform/i18n';
import { GuideBlockLayout } from './block-layout';
let host: HTMLDivElement;
let root: Root;
const change = vi.fn();
const originalSet = HTMLElement.prototype.setPointerCapture;
const originalHas = HTMLElement.prototype.hasPointerCapture;
const originalRelease = HTMLElement.prototype.releasePointerCapture;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 200));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  HTMLElement.prototype.setPointerCapture = originalSet;
  HTMLElement.prototype.hasPointerCapture = originalHas;
  HTMLElement.prototype.releasePointerCapture = originalRelease;
});
async function render(disabled = false, width: 'full' | 'half' | number = 'full') {
  await act(async () =>
    root.render(
      <GuideBlockLayout
        block={{ kind: 'text', id: 'text', paragraphs: [], width }}
        layout="stacked"
        disabled={disabled}
        onWidth={change}
        t={createTranslator('en')}
      >
        Text
      </GuideBlockLayout>
    )
  );
}
async function pointer(type: string, x: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  await act(async () => host.querySelector('button')!.dispatchEvent(event));
}
async function key(key: string) {
  await act(async () =>
    host
      .querySelector('button')!
      .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  );
}
it('previews without writes, survives equivalent rerender and commits one proportional drag', async () => {
  await render();
  await pointer('pointerdown', 100);
  await pointer('pointermove', 60);
  expect(host.firstElementChild?.getAttribute('data-width')).toBe('90');
  expect(change).not.toHaveBeenCalled();
  await render();
  expect(host.firstElementChild?.getAttribute('data-width')).toBe('90');
  await pointer('pointerup', 60);
  await act(async () =>
    host
      .querySelector('button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  );
  expect(change.mock.calls).toEqual([[90]]);
});
it('click and arrow keys provide discrete keyboard composition without duplicate writes', async () => {
  await render();
  await act(async () => host.querySelector('button')!.click());
  expect(change.mock.calls).toEqual([['half']]);
  await render(false, 'half');
  await key('ArrowLeft');
  expect(change.mock.calls).toEqual([['half'], [49]]);
  await key('ArrowRight');
  expect(change.mock.calls).toEqual([['half'], [49], [51]]);
});
it('Escape, lost capture and disabling cancel a draft without edits', async () => {
  for (const cancel of ['Escape', 'pointercancel', 'disabled']) {
    await render();
    await pointer('pointerdown', 100);
    await pointer('pointermove', 50);
    if (cancel === 'Escape') await key('Escape');
    else if (cancel === 'disabled') await render(true);
    else await pointer(cancel, 50);
    await pointer('pointerup', 50);
    expect(host.firstElementChild?.getAttribute('data-width')).toBe('100');
    expect(change).not.toHaveBeenCalled();
  }
});

it('returning to the starting point cancels the width change and keyboard works after Escape', async () => {
  await render();
  await pointer('pointerdown', 100);
  await pointer('pointermove', 50);
  await pointer('pointermove', 100);
  expect(host.firstElementChild?.getAttribute('data-width')).toBe('100');
  await pointer('pointerup', 100);
  expect(change).not.toHaveBeenCalled();
  await pointer('pointerdown', 100);
  await pointer('pointermove', 50);
  await key('Escape');
  await act(async () => host.querySelector('button')!.click());
  expect(change.mock.calls).toEqual([['half']]);
});

it('clamps drag percentages and keeps the cursor and preview until release', async () => {
  await render(false, 63);
  await pointer('pointerdown', 300);
  await pointer('pointermove', -500);
  expect(host.firstElementChild?.getAttribute('data-width')).toBe('20');
  expect(host.querySelector('output')?.textContent).toBe('20%');
  expect(document.documentElement.hasAttribute('data-guide-width-resizing')).toBe(true);
  await pointer('pointerup', -500);
  expect(change.mock.calls).toEqual([[20]]);
  expect(document.documentElement.hasAttribute('data-guide-width-resizing')).toBe(false);
  await render(false, 63);
  await pointer('pointerdown', 300);
  await pointer('pointermove', 1000);
  await pointer('pointerup', 1000);
  expect(change.mock.calls).toEqual([[20], [100]]);
});
it('small pointer movement remains a click and lost capture prevents a drag commit', async () => {
  await render();
  await pointer('pointerdown', 100);
  await pointer('pointermove', 103);
  await pointer('pointerup', 103);
  await act(async () =>
    host
      .querySelector('button')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  );
  expect(change.mock.calls).toEqual([['half']]);
  change.mockClear();
  await pointer('pointerdown', 100);
  await pointer('pointermove', 50);
  await pointer('lostpointercapture', 50);
  await pointer('pointerup', 50);
  expect(change).not.toHaveBeenCalled();
  expect(document.documentElement.hasAttribute('data-guide-width-resizing')).toBe(false);
});
it('unmount releases pointer capture and global cursor state without committing', async () => {
  await render();
  await pointer('pointerdown', 100);
  await pointer('pointermove', 50);
  await act(async () => root.render(null));
  expect(document.documentElement.hasAttribute('data-guide-width-resizing')).toBe(false);
  expect(change).not.toHaveBeenCalled();
  expect(HTMLElement.prototype.releasePointerCapture).toHaveBeenCalled();
});
