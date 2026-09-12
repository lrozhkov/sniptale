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

it('snaps to a neighboring width, shows matching edges and releases beyond tolerance', async () => {
  await render();
  const neighbor = document.createElement('div');
  neighbor.className = 'guide-block';
  neighbor.dataset['width'] = '63';
  host.append(neighbor);
  await pointer('pointerdown', 400);
  await pointer('pointermove', 255);
  expect(host.firstElementChild?.getAttribute('data-width')).toBe('63');
  expect(neighbor.dataset['sizeMatch']).toBe('width');
  expect(host.firstElementChild?.getAttribute('data-size-snap')).toBe('width');
  await pointer('pointermove', 280);
  expect(host.firstElementChild?.getAttribute('data-width')).toBe('70');
  expect(neighbor.hasAttribute('data-size-match')).toBe(false);
  await pointer('pointermove', 252);
  await pointer('pointerup', 252);
  expect(change.mock.calls).toEqual([[63]]);
  expect(neighbor.hasAttribute('data-size-match')).toBe(false);
  neighbor.remove();
});

it('Alt bypasses size snapping and Escape clears both matching edges', async () => {
  await render();
  await pointer('pointerdown', 400);
  const event = new MouseEvent('pointermove', {
    bubbles: true,
    button: 0,
    clientX: 202,
    altKey: true,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  await act(async () => host.querySelector('button')!.dispatchEvent(event));
  expect(host.firstElementChild?.getAttribute('data-width')).toBe('51');
  expect(host.firstElementChild?.hasAttribute('data-size-snap')).toBe(false);
  await key('Escape');
  expect(change).not.toHaveBeenCalled();
});

it('reserves height with one accepted edit, supports auto reset and cancels without writes', async () => {
  const height = vi.fn();
  await act(async () =>
    root.render(
      <GuideBlockLayout
        block={{ kind: 'text', id: 'text', paragraphs: [] }}
        layout="stacked"
        disabled={false}
        onWidth={change}
        onHeight={height}
        t={createTranslator('en')}
      >
        Text
      </GuideBlockLayout>
    )
  );
  const block = host.querySelector('.guide-block')!;
  vi.spyOn(block, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 80));
  const handle = host.querySelector('.guide-block-height')!;
  const move = async (type: string, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    await act(async () => handle.dispatchEvent(event));
  };
  await move('pointerdown', 80);
  await move('pointermove', 180);
  expect(block.getAttribute('style')).toContain('--guide-block-min-height: 180px');
  expect(height).not.toHaveBeenCalled();
  await move('pointerup', 180);
  expect(height.mock.calls).toEqual([[180]]);
  height.mockClear();
  await move('pointerdown', 80);
  await move('pointermove', 160);
  await act(async () =>
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  await move('pointerup', 160);
  expect(height).not.toHaveBeenCalled();
  await act(async () =>
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
  );
  expect(height.mock.calls).toEqual([[0]]);
});

it('matches neighboring height and removes guides on pointer cancellation', async () => {
  const height = vi.fn();
  await act(async () =>
    root.render(
      <GuideBlockLayout
        block={{ kind: 'heading', id: 'heading', text: 'Title' }}
        layout="stacked"
        disabled={false}
        onWidth={change}
        onHeight={height}
        t={createTranslator('en')}
      >
        Title
      </GuideBlockLayout>
    )
  );
  const block = host.querySelector<HTMLElement>('.guide-block')!;
  vi.spyOn(block, 'getBoundingClientRect').mockImplementation(
    () =>
      new DOMRect(
        0,
        0,
        400,
        Math.max(80, parseFloat(block.style.getPropertyValue('--guide-block-min-height')) || 0)
      )
  );
  const neighbor = document.createElement('div');
  neighbor.className = 'guide-block';
  host.append(neighbor);
  vi.spyOn(neighbor, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 150, 400, 120));
  const handle = host.querySelector('.guide-block-height')!;
  for (const [type, y] of [
    ['pointerdown', 80],
    ['pointermove', 117],
  ] as const) {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    await act(async () => handle.dispatchEvent(event));
  }
  expect(block.dataset['sizeSnap']).toBe('height');
  expect(neighbor.dataset['sizeMatch']).toBe('height');
  expect(block.style.getPropertyValue('--guide-block-min-height')).toBe('120px');
  await act(async () => handle.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true })));
  expect(block.hasAttribute('data-size-snap')).toBe(false);
  expect(neighbor.hasAttribute('data-size-match')).toBe(false);
  expect(height).not.toHaveBeenCalled();
  neighbor.remove();
});

it('keeps custom size magnets across authored row containers', async () => {
  await render();
  const step = document.createElement('div');
  step.className = 'guide-step-blocks';
  document.body.append(step);
  step.append(host);
  const row = document.createElement('div');
  row.className = 'guide-block-row';
  const neighbor = document.createElement('div');
  neighbor.className = 'guide-block';
  neighbor.dataset['width'] = '63';
  row.append(neighbor);
  step.append(row);
  await pointer('pointerdown', 400);
  await pointer('pointermove', 255);
  expect(host.firstElementChild?.getAttribute('data-width')).toBe('63');
  expect(neighbor.dataset['sizeMatch']).toBe('width');
  await pointer('pointerup', 255);
  expect(change).toHaveBeenCalledWith(63);
  step.remove();
});
