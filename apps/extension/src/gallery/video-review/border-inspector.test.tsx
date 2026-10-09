// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewBorderInspector, ReviewBorderAnimation } from './border-inspector';
import { createQuickEditBorder } from '../../features/video/review/advanced/border';
import {
  createQuickEditZoomRegion,
  updateQuickEditZoomRegion,
} from '../../features/video/review/advanced/zoom';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const field = (name: string, scope: ParentNode = host) =>
  scope.querySelector<HTMLInputElement>(`[aria-label="gallery.videoReview.${name}"]`)!;
const hold = () =>
  [...host.querySelectorAll('fieldset')].find(
    (node) => node.querySelector('legend')?.textContent === 'gallery.videoReview.borderHold'
  )!;
async function input(node: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function enter(node: HTMLInputElement, value: string) {
  await input(node, value);
  await act(async () =>
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
}
async function choose(label: string, option: string, scope: ParentNode = host) {
  if (label !== 'focusReveal') {
    await act(async () => field(label, scope).click());
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
        .find((node) => node.textContent?.includes(`gallery.videoReview.${option}`))!
        .click()
    );
    return;
  }
  const direct = (key: string) =>
    scope.querySelector<HTMLButtonElement>(`[title="gallery.videoReview.${key}"]`)!;
  const reveal = option.startsWith('borderDraw')
    ? 'borderDrawing'
    : option.startsWith('borderErase')
      ? 'borderErasing'
      : option.startsWith('borderRotate')
        ? 'borderRotation'
        : option;
  await act(async () => direct(reveal).click());
  if (
    option.startsWith('borderDraw') ||
    option.startsWith('borderErase') ||
    option.startsWith('borderRotate')
  )
    await act(async () =>
      direct(
        option.includes('Counterclockwise') ? 'borderCounterclockwise' : 'borderClockwise'
      ).click()
    );
}
async function scrub(name: string, value: string, cancel = false, scope: ParentNode = host) {
  const node = field(`${name} range`, scope);
  act(() => node.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  await input(node, value);
  act(() =>
    node.dispatchEvent(new MouseEvent(cancel ? 'pointercancel' : 'pointerup', { bubbles: true }))
  );
}

it('edits stroke style and clamped source area without changing unrelated appearance', async () => {
  let value = createQuickEditBorder();
  const preview = vi.fn();
  const change = vi.fn((next: typeof value) => {
    value = next;
    render();
  });
  const render = () =>
    root.render(<ReviewBorderInspector value={value} onChange={change} onPreview={preview} />);
  act(render);
  await choose('borderStyle', 'borderStyle_dashed');
  await choose('borderStyle', 'borderStyle_dotted');
  await choose('borderStyle', 'borderStyle_solid');
  for (const [label, next] of [
    ['focusAreaX', '10'],
    ['focusAreaY', '20'],
    ['focusAreaWidth', '60'],
    ['focusAreaHeight', '70'],
    ['focusRoundness', '20'],
  ] as const)
    await enter(field(label), next);
  expect(value).toMatchObject({
    style: 'solid',
    width: 3,
    roundness: 0.2,
    area: { x: 0.1, y: 0.2, width: 0.6, height: 0.7 },
  });
  await scrub('focusRoundness', '30');
  expect(value.roundness).toBe(0.3);
  await scrub('focusRoundness', '40', true);
  expect(value.roundness).toBe(0.3);
  await scrub('focusAreaWidth', '100');
  expect(value.area).toMatchObject({ x: 0, width: 1 });
  const count = change.mock.calls.length;
  await scrub('focusAreaWidth', '20', true);
  expect(change).toHaveBeenCalledTimes(count);
  expect(preview).toHaveBeenLastCalledWith(null);
});

it('uses source-time coupled duration budgets and exposes rotation speed only when needed', async () => {
  let region = {
    ...createQuickEditZoomRegion({ id: 'border', at: 0, duration: 10, endMax: 10 }),
    sourceAnchor: { start: 2, end: 4 },
    border: { ...createQuickEditBorder(), style: 'dashed' as const },
  };
  const preview = vi.fn();
  const change = vi.fn((patch: Parameters<typeof updateQuickEditZoomRegion>[2]) => {
    region = updateQuickEditZoomRegion([region], region.id, patch)[0]! as typeof region;
    render();
  });
  const render = () =>
    root.render(<ReviewBorderAnimation region={region} onChange={change} onPreview={preview} />);
  act(render);
  const phases = () => [...host.querySelectorAll('fieldset')].filter((node) => node !== hold());
  expect([...host.querySelectorAll('legend')].map((node) => node.textContent)).toEqual([
    'gallery.videoReview.zoomTransitionIn',
    'gallery.videoReview.borderHold',
    'gallery.videoReview.zoomTransitionOut',
  ]);
  await choose('focusReveal', 'borderDraw', phases()[0]);
  await choose('focusReveal', 'borderErase', phases()[1]);
  expect(region.border).toMatchObject({ reveal: 'draw', exitReveal: 'erase' });
  await choose('focusReveal', 'borderDrawCounterclockwise', phases()[0]);
  await choose('focusReveal', 'borderEraseCounterclockwise', phases()[1]);
  expect(region.border).toMatchObject({ reveal: 'draw-ccw', exitReveal: 'erase-ccw' });
  await enter(field('zoomTransitionDuration', phases()[0]), '9');
  expect(region.enter.duration).toBe(1.7);
  expect(region.enter.duration + region.exit.duration).toBe(2);
  await scrub('zoomTransitionDuration', '0.5', false, phases()[0]);
  expect(region.enter.duration).toBe(0.5);
  await scrub('zoomTransitionDuration', '0.7', true, phases()[1]);
  expect(region.exit.duration).toBe(0.3);
  await choose('focusReveal', 'borderAppear', phases()[0]);
  await choose('focusReveal', 'borderDisappear', phases()[1]);
  expect(region.enter.type).toBe('none');
  expect(region.exit.type).toBe('none');
  expect(field('zoomTransitionDuration', phases()[0]).disabled).toBe(true);
  await choose('focusReveal', 'focusFade', phases()[0]);
  await choose('focusReveal', 'focusFade', phases()[1]);
  expect(region.border).toMatchObject({ reveal: 'fade', exitReveal: 'fade' });
  expect(field('borderSpeed')).toBeNull();
  await choose('focusReveal', 'borderRotateClockwise', hold());
  expect(field('borderSegmentPercent').value).toBe('100');
  await scrub('borderSegmentPercent', '35');
  expect(region.border.segmentPercent).toBe(35);
  await scrub('borderSegmentPercent', '50', true);
  expect(region.border.segmentPercent).toBe(35);
  await input(field('borderSegmentPercent'), '70');
  act(() =>
    field('borderSegmentPercent').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
  );
  expect(region.border.segmentPercent).toBe(35);
  expect(preview).toHaveBeenLastCalledWith(null);
  await enter(field('borderSegmentPercent'), '200');
  expect(region.border.segmentPercent).toBe(100);
  await enter(field('borderSegmentPercent'), '0');
  expect(region.border.segmentPercent).toBe(1);
  await scrub('borderSpeed', '4');
  expect(region.border.period).toBe(0.5);
  await scrub('borderSpeed', '1', true);
  expect(region.border.period).toBe(0.5);
  await enter(field('borderSpeed'), '0');
  expect(region.border.period).toBe(20);
  await enter(field('borderSpeed'), '10');
  expect(region.border.period).toBe(0.5);
  await choose('focusReveal', 'borderRotateCounterclockwise', hold());
  expect(region.border.motion).toBe('counterclockwise');
  await choose('focusReveal', 'borderPulse', hold());
  expect(region.border.motion).toBe('pulse');
  expect(field('borderSegmentPercent')).toBeNull();
  expect(preview).toHaveBeenLastCalledWith(null);
  await choose('focusReveal', 'borderRipple', hold());
  expect(region.border.motion).toBe('ripple');
  expect(field('borderSegmentPercent')).toBeNull();
  await choose('focusReveal', 'borderStill', hold());
  expect(region.border.loop).toBe(false);
  expect(field('borderSpeed')).toBeNull();
});

it('commits an edited color and discards an open picker draft on Escape', async () => {
  const onChange = vi.fn();
  const onPreview = vi.fn();
  act(() =>
    root.render(
      <ReviewBorderInspector
        value={createQuickEditBorder()}
        onChange={onChange}
        onPreview={onPreview}
      />
    )
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="shared.ui.color-selector.value-trigger"]')!
      .click()
  );
  await enter(field('borderColor'), '#123456');
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ color: '#123456' }));
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="shared.ui.color-selector.picker-trigger"]')!
      .click()
  );
  expect(document.querySelector('[data-ui="shared.ui.color-selector.picker"]')).not.toBeNull();
  await input(
    document.querySelector<HTMLInputElement>('input[aria-label="shared.ui.colorSelectorHex"]')!,
    '#abcdef'
  );
  expect(onPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({ border: expect.objectContaining({ color: '#abcdef' }) })
  );
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(onPreview).toHaveBeenLastCalledWith(null);
});

it('offers no rotating hold for a solid stroke', async () => {
  const region = {
    ...createQuickEditZoomRegion({ id: 'solid', at: 0 }),
    border: createQuickEditBorder(),
  };
  act(() => root.render(<ReviewBorderAnimation region={region} onChange={vi.fn()} />));
  const options = [...field('focusReveal', hold()).querySelectorAll('button')].map(
    (node) => node.textContent
  );
  expect(options).toEqual([
    'gallery.videoReview.borderStill',
    'gallery.videoReview.borderPulse',
    'gallery.videoReview.borderRipple',
  ]);
});

it('stops rotation when switching to solid but retains pulse for all stroke styles', async () => {
  let value = {
    ...createQuickEditBorder(),
    style: 'dashed' as 'solid' | 'dashed' | 'dotted',
    loop: true,
  };
  const change = vi.fn((next: typeof value) => {
    value = next;
    render();
  });
  const render = () => root.render(<ReviewBorderInspector value={value} onChange={change} />);
  act(render);
  await choose('borderStyle', 'borderStyle_solid');
  expect(value.loop).toBe(false);
  value = { ...value, loop: true, motion: 'pulse' };
  act(render);
  await choose('borderStyle', 'borderStyle_dotted');
  await choose('borderStyle', 'borderStyle_solid');
  expect(value).toMatchObject({ loop: true, motion: 'pulse', style: 'solid' });
  value = { ...value, motion: 'ripple' };
  act(render);
  await choose('borderStyle', 'borderStyle_dashed');
  await choose('borderStyle', 'borderStyle_solid');
  expect(value).toMatchObject({ loop: true, motion: 'ripple', style: 'solid' });
});

it.each(['pulse', 'ripple'] as const)(
  'previews %s speed and cancels Escape without committing',
  async (motion) => {
    const region = {
      ...createQuickEditZoomRegion({ id: 'pulse', at: 0 }),
      border: { ...createQuickEditBorder(), motion, loop: true },
    };
    const onChange = vi.fn();
    const onPreview = vi.fn();
    act(() =>
      root.render(
        <ReviewBorderAnimation region={region} onChange={onChange} onPreview={onPreview} />
      )
    );
    expect(field('borderSpeed').value).toBe('1');
    expect(field('borderSegmentPercent')).toBeNull();
    const slider = field('borderSpeed range');
    act(() => slider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    await input(slider, '2');
    expect(onPreview).toHaveBeenLastCalledWith({ border: { ...region.border, period: 1 } });
    act(() => slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    act(() => slider.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    expect(onChange).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenLastCalledWith(null);
  }
);

it('shows legacy Solid rotation as still without rewriting saved state', () => {
  const region = {
    ...createQuickEditZoomRegion({ id: 'legacy', at: 0 }),
    border: { ...createQuickEditBorder(), loop: true },
  };
  const onChange = vi.fn();
  act(() => root.render(<ReviewBorderAnimation region={region} onChange={onChange} />));
  expect(hold().querySelector('[title="gallery.videoReview.borderStill"]')).toHaveProperty(
    'ariaPressed',
    'true'
  );
  expect(field('borderSpeed')).toBeNull();
  expect(field('borderSegmentPercent')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  expect(region.border.loop).toBe(true);
});
