// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideStep } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideBlockReorder, GuideBlockReorderHandle } from './block-reorder';
const operate = vi.fn();
let root: Root;
let host: HTMLDivElement;
const originalCapture = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'setPointerCapture');
const originalHas = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hasPointerCapture');
const originalRelease = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'releasePointerCapture'
);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  for (const [key, value] of Object.entries({
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  }))
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value });
  host = document.createElement('div');
  host.className = 'guide-document';
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  for (const [key, descriptor] of [
    ['setPointerCapture', originalCapture],
    ['hasPointerCapture', originalHas],
    ['releasePointerCapture', originalRelease],
  ] as const) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, key);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(disabled = false) {
  const item = createGuideStep('', 'step');
  item.blocks = ['a', 'b', 'c'].map((id) => ({ kind: 'text', id, paragraphs: [] }));
  await act(async () =>
    root.render(
      <GuideBlockReorder projectId="project" item={item} disabled={disabled} onOperate={operate}>
        {item.blocks.map((block) => (
          <div className="guide-block" key={block.id} data-block-id={block.id} id={block.id}>
            <span>{`Body ${block.id}`}</span>
            <GuideBlockReorderHandle blockId={block.id} t={createTranslator('en')} />
          </div>
        ))}
      </GuideBlockReorder>
    )
  );
  vi.spyOn(host.querySelector('.guide-step-blocks')!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 340)
  );
  for (const [index, block] of [...host.querySelectorAll('[data-block-id]')].entries())
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, index * 120, 100, 100));
}
async function pointer(type: string, x: number, y: number, pointerId = 1) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  await act(async () =>
    (type === 'pointerdown' ? host.querySelector('button')! : window).dispatchEvent(event)
  );
  return event;
}
it('previews block content without controls and uses one marker for either side of a gap', async () => {
  await render();
  await pointer('pointerdown', -14, 14);
  await pointer('pointermove', 50, 225);
  const preview = host.querySelector('.guide-block-drag-preview')!;
  expect(preview.textContent).toBe('Body a');
  expect(preview.querySelector('button')).toBeNull();
  expect(preview.hasAttribute('id')).toBe(false);
  expect(preview.hasAttribute('data-block-id')).toBe(false);
  expect(document.documentElement.dataset['guideReordering']).toBe('true');
  expect(host.querySelector('[data-reorder]')?.id).toBe('c');
  expect(host.querySelector('[data-reorder]')?.getAttribute('data-reorder')).toBe('row-before');
  await pointer('pointermove', 50, 250);
  expect(host.querySelector('[data-reorder]')?.id).toBe('c');
  expect(host.querySelectorAll('[data-reorder]')).toHaveLength(1);
  expect(operate).not.toHaveBeenCalled();
  await pointer('pointerup', 50, 250);
  expect(operate.mock.calls).toEqual([
    [
      {
        kind: 'place-block',
        itemId: 'step',
        targetItemId: 'step',
        blockId: 'a',
        anchorBlockId: 'c',
        placement: 'row-before',
      },
    ],
  ]);
  expect(host.querySelector('[data-reorder]')).toBeNull();
  expect(host.querySelector('.guide-block-drag-preview')).toBeNull();
  expect(document.documentElement.hasAttribute('data-guide-reordering')).toBe(false);
});
it('ignores threshold movement, adjacent no-ops, other pointers and drops outside the step', async () => {
  await render();
  await pointer('pointerdown', -14, 14);
  await pointer('pointermove', -12, 15);
  expect(host.querySelector('.guide-block-drag-preview')).toBeNull();
  await pointer('pointermove', 50, 300, 2);
  expect(host.querySelector('[data-reorder]')).toBeNull();
  await pointer('pointermove', 50, 130);
  expect(host.querySelector('[data-reorder]')).toBeNull();
  await pointer('pointerup', 50, 130);
  expect(operate).not.toHaveBeenCalled();
  await pointer('pointerdown', -14, 14);
  await pointer('pointermove', 50, 300);
  await pointer('pointerup', 400, 300);
  expect(operate).not.toHaveBeenCalled();
});
it.each(['Escape', 'pointercancel', 'blur', 'disable', 'unmount', 'lostpointercapture'])(
  'cleans the complete gesture on %s without an edit',
  async (reason) => {
    await render();
    await pointer('pointerdown', -14, 14);
    await pointer('pointermove', 50, 300);
    if (reason === 'disable') await render(true);
    else if (reason === 'unmount') act(() => root.render(null));
    else
      await act(async () => {
        if (reason === 'Escape')
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        else if (reason === 'lostpointercapture')
          host.querySelector('button')!.dispatchEvent(new Event(reason));
        else window.dispatchEvent(new Event(reason));
      });
    await pointer('pointerup', 50, 300);
    expect(operate).not.toHaveBeenCalled();
    expect(
      host.querySelector('[data-reorder],.guide-block-drag-preview,[data-drag-source]')
    ).toBeNull();
    expect(document.documentElement.hasAttribute('data-guide-reordering')).toBe(false);
  }
);
it('keeps keyboard movement and native image drops independent, and ignores disabled grips', async () => {
  await render();
  const key = (key: string) =>
    act(async () =>
      host
        .querySelector('button')!
        .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    );
  await key('ArrowUp');
  expect(operate).not.toHaveBeenCalled();
  await key('ArrowDown');
  expect(operate).toHaveBeenCalledWith({
    kind: 'move-block',
    itemId: 'step',
    blockId: 'a',
    direction: 1,
  });
  await key('ArrowRight');
  expect(operate).toHaveBeenLastCalledWith({
    kind: 'place-block',
    itemId: 'step',
    targetItemId: 'step',
    blockId: 'a',
    anchorBlockId: 'b',
    placement: 'before',
  });
  const drop = new Event('drop', { bubbles: true, cancelable: true });
  host.querySelector('.guide-block')!.dispatchEvent(drop);
  expect(drop.defaultPrevented).toBe(false);
  await render(true);
  await pointer('pointerdown', -14, 14);
  await pointer('pointermove', 50, 300);
  await pointer('pointerup', 50, 300);
  await key('ArrowDown');
  expect(operate).toHaveBeenCalledTimes(2);
});

it('scrolls the document at its edge and stops the frame loop on cancellation', async () => {
  await render();
  const pane = document.createElement('div');
  pane.className = 'guide-document-scroll';
  document.body.append(pane);
  pane.append(host);
  vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 200));
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const stop = vi.spyOn(window, 'cancelAnimationFrame');
  await pointer('pointerdown', -14, 14);
  await pointer('pointermove', 50, 195);
  await act(async () => frames[0]?.(0));
  expect(pane.scrollTop).toBe(12);
  await pointer('pointercancel', 50, 195);
  expect(stop).toHaveBeenCalledWith(2);
  await act(async () => frames[1]?.(16));
  expect(pane.scrollTop).toBe(12);
  expect(operate).not.toHaveBeenCalled();
  pane.remove();
});

it('keeps a clicked grip focused without drag chrome and clears focus after a real drag', async () => {
  await render();
  const handle = host.querySelector<HTMLButtonElement>('button')!;
  await pointer('pointerdown', -14, 14);
  expect(document.activeElement).toBe(handle);
  expect(document.documentElement.hasAttribute('data-guide-reordering')).toBe(false);
  await pointer('pointerup', -14, 14);
  expect(document.activeElement).toBe(handle);
  await pointer('pointerdown', -14, 14);
  await pointer('pointermove', 50, 300);
  expect(document.documentElement.hasAttribute('data-guide-reordering')).toBe(true);
  await pointer('pointerup', 50, 300);
  expect(document.activeElement).not.toBe(handle);
});

it('targets another step, including an empty step, and cancels outside the canvas', async () => {
  await render();
  const target = document.createElement('div');
  target.className = 'guide-step-blocks';
  target.dataset['reorderStep'] = 'other';
  host.append(target);
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 400, 100, 180));
  await pointer('pointerdown', -14, 14);
  await pointer('pointermove', 50, 450);
  expect(target.dataset['reorder']).toBe('row-before');
  await pointer('pointerup', 50, 450);
  expect(operate).toHaveBeenLastCalledWith({
    kind: 'place-block',
    placement: 'row-before',
    itemId: 'step',
    targetItemId: 'other',
    blockId: 'a',
  });
  const block = document.createElement('div');
  block.className = 'guide-block';
  block.dataset['blockId'] = 'other-block';
  target.append(block);
  vi.spyOn(block, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 400, 100, 100));
  await pointer('pointerdown', -14, 14);
  await pointer('pointermove', 50, 410);
  expect(block.dataset['reorder']).toBe('row-before');
  await pointer('pointerup', 50, 410);
  expect(operate).toHaveBeenLastCalledWith({
    kind: 'place-block',
    placement: 'row-before',
    itemId: 'step',
    targetItemId: 'other',
    blockId: 'a',
    anchorBlockId: 'other-block',
  });
  operate.mockClear();
  target.dataset['reorderDisabled'] = 'true';
  await pointer('pointerdown', -14, 14);
  await pointer('pointermove', 50, 410);
  expect(host.querySelector('[data-reorder]')).toBeNull();
  await pointer('pointerup', 50, 410);
  expect(operate).not.toHaveBeenCalled();
});

it('rejects targets clipped outside the visible document pane', async () => {
  await render();
  host.classList.add('guide-document-scroll');
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 180));
  await pointer('pointerdown', -14, 14);
  await pointer('pointermove', 50, 250);
  expect(host.querySelector('[data-reorder]')).toBeNull();
  await pointer('pointerup', 50, 250);
  expect(operate).not.toHaveBeenCalled();
});

it('keeps a drag through an equivalent autosave copy and uses the latest operation receiver', async () => {
  const item = createGuideStep('', 'step');
  item.blocks = [{ kind: 'text', id: 'a', paragraphs: [] }];
  const latest = vi.fn();
  const mount = async (receiver: typeof operate) =>
    act(async () =>
      root.render(
        <GuideBlockReorder projectId="project" item={item} disabled={false} onOperate={receiver}>
          <div className="guide-block" data-block-id="a">
            <GuideBlockReorderHandle blockId="a" t={createTranslator('en')} />
          </div>
        </GuideBlockReorder>
      )
    );
  await mount(operate);
  vi.spyOn(host.querySelector('.guide-step-blocks')!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 100)
  );
  const target = document.createElement('div');
  target.dataset['reorderStep'] = 'other';
  target.className = 'guide-step-blocks';
  host.append(target);
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 200, 100, 100));
  await pointer('pointerdown', 10, 10);
  await pointer('pointermove', 50, 240);
  item.blocks = item.blocks.map(({ id, ...content }) => ({ ...structuredClone(content), id }));
  await mount(latest);
  await pointer('pointerup', 50, 240);
  expect(operate).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledWith({
    kind: 'place-block',
    placement: 'row-before',
    itemId: 'step',
    targetItemId: 'other',
    blockId: 'a',
  });
});
