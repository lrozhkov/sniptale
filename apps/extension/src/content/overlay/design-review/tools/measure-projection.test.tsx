// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it } from 'vitest';
import { createDesignReviewMeasureState } from '../../../selection/design-review/measure';
import { readMeasurePair } from './measure-model';
import { DesignReviewMeasureProjection } from './measure-projection';

afterEach(() => document.body.replaceChildren());

function target(x: number, y: number) {
  const element = document.createElement('div');
  document.body.append(element);
  const rect = DOMRect.fromRect({ x, y, width: 100, height: 40 });
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
  Object.defineProperty(element, 'getClientRects', { value: () => [rect] });
  return element;
}

it('keeps the live projection passive and hides it when the tool is inactive', () => {
  const a = target(100, 200),
    b = target(216, 260);
  const model = readMeasurePair({ ...createDesignReviewMeasureState(), a, b, slot: null });
  const source = [a.outerHTML, b.outerHTML];
  expect(renderToStaticMarkup(<DesignReviewMeasureProjection model={model} active={false} />)).toBe(
    ''
  );
  // Parse trusted React output with a DOM parser without changing page source.
  const doc = new DOMParser().parseFromString(
    renderToStaticMarkup(<DesignReviewMeasureProjection model={model} active />),
    'text/html'
  );
  expect(doc.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  expect(doc.querySelector('svg')?.classList.contains('pointer-events-none')).toBe(true);
  expect(
    doc.querySelectorAll('[data-ui="content.design-review.measure-target-label"]')
  ).toHaveLength(2);
  const labels = doc.querySelectorAll('[data-ui="content.design-review.measure-guide-label"]');
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    expect(Number(label.getAttribute('x'))).toBeGreaterThanOrEqual(0);
    expect(Number(label.getAttribute('y'))).toBeGreaterThanOrEqual(68);
    expect(
      Number(label.getAttribute('x')) + Number(label.getAttribute('width'))
    ).toBeLessThanOrEqual(window.innerWidth);
    expect(
      Number(label.getAttribute('y')) + Number(label.getAttribute('height'))
    ).toBeLessThanOrEqual(window.innerHeight);
  }
  expect([a.outerHTML, b.outerHTML]).toEqual(source);
});

// The panel and projection share the sampled pair but keep selection in its owner.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';
import { translate } from '../../../../platform/i18n';
import { DesignReviewMeasureSection, useDesignReviewMeasureModel } from './measure';
import type { DesignReviewMeasureState } from '../../../selection/design-review/measure';
import * as selection from '../../../selection/design-review';

vi.mock('../../../selection/design-review', () => ({
  beginDesignReviewMeasureSelection: vi.fn(),
  acceptDesignReviewMeasureSelection: vi.fn(),
  swapDesignReviewMeasureTargets: vi.fn(),
  clearDesignReviewMeasure: vi.fn(),
  clearDesignReviewMeasureB: vi.fn(),
}));

let panelRoot: Root | undefined;
afterEach(() => {
  act(() => panelRoot?.unmount());
  panelRoot = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mountPanel(state: DesignReviewMeasureState, current: Element | null = null) {
  const host = document.createElement('div');
  document.body.append(host);
  panelRoot = createRoot(host);
  const update = (next: DesignReviewMeasureState, selected: Element | null = current) =>
    act(() =>
      panelRoot!.render(
        <DesignReviewMeasureSection state={next} model={readMeasurePair(next)} current={selected} />
      )
    );
  update(state);
  return { host, update };
}

function button(host: HTMLElement, key: Parameters<typeof translate>[0]) {
  const result = Array.from(host.querySelectorAll('button')).find(
    (item) =>
      item.getAttribute('aria-label') === translate(key) || item.textContent === translate(key)
  );
  if (!result) throw new Error(`Missing button: ${key}`);
  return result;
}

it('guards incomplete selection and routes choose, accept, swap and clear controls to the selection owner', () => {
  const initial = createDesignReviewMeasureState();
  const a = target(100, 200),
    b = target(216, 260);
  a.id = 'first';
  const { host, update } = mountPanel(initial, a);
  expect(button(host, 'content.designReview.measureChooseB').disabled).toBe(true);
  expect(button(host, 'content.designReview.measureSwap').disabled).toBe(true);
  expect(button(host, 'content.designReview.measureClear').disabled).toBe(true);
  act(() => button(host, 'content.designReview.measureChooseA').click());
  expect(selection.beginDesignReviewMeasureSelection).toHaveBeenCalledWith('a');
  const accept = Array.from(host.querySelectorAll('button')).find(
    (item) =>
      item.textContent ===
      translate('content.designReview.measureUseCurrent').replace('{slot}', 'A')
  )!;
  act(() => accept.click());
  expect(selection.acceptDesignReviewMeasureSelection).toHaveBeenCalledOnce();
  const pair = { ...initial, a, b, slot: null };
  update(pair);
  expect(host.textContent).toContain('div#first');
  expect(button(host, 'content.designReview.measureChooseA').textContent).toBe(
    translate('content.designReview.measureReplace')
  );
  act(() => {
    button(host, 'content.designReview.measureChooseB').click();
    button(host, 'content.designReview.measureSwap').click();
    button(host, 'content.designReview.measureClearB').click();
    button(host, 'content.designReview.measureClear').click();
  });
  expect(selection.beginDesignReviewMeasureSelection).toHaveBeenLastCalledWith('b');
  expect(selection.swapDesignReviewMeasureTargets).toHaveBeenCalledOnce();
  expect(selection.clearDesignReviewMeasureB).toHaveBeenCalledOnce();
  expect(selection.clearDesignReviewMeasure).toHaveBeenCalledOnce();
});

it('rejects duplicate or detached current targets and explains unavailable accepted targets', () => {
  const a = target(100, 200),
    b = target(216, 260);
  const state = { ...createDesignReviewMeasureState(), a, slot: 'b' as const };
  const { host, update } = mountPanel(state, a);
  const acceptText = translate('content.designReview.measureUseCurrent').replace('{slot}', 'B');
  expect(host.textContent).not.toContain(acceptText);
  update(state, b);
  expect(host.textContent).toContain(acceptText);
  b.remove();
  update(state, b);
  expect(host.textContent).not.toContain(acceptText);
  update({ ...state, b, slot: null });
  expect(host.textContent).toContain(translate('content.designReview.measureUnavailable'));
  expect(host.textContent).toContain(translate('content.designReview.measureUnavailableHint'));
  expect(host.querySelector('[data-ui="content.design-review.measure-geometry"]')).toBeNull();
  update({ ...state, b: a, slot: 'a' }, a);
  expect(host.textContent).not.toContain(
    translate('content.designReview.measureUseCurrent').replace('{slot}', 'A')
  );
});

it('shows preview geometry, containment and difference disclosures without editing source styles', () => {
  const a = target(100, 200),
    b = target(216, 260);
  const initial = { ...createDesignReviewMeasureState(), a, b, slot: null };
  const { host, update } = mountPanel(initial);
  expect(host.textContent).toContain(translate('content.designReview.measureGapX'));
  expect(host.textContent).toContain(translate('content.designReview.measureGapY'));
  expect(host.textContent).toContain(translate('content.designReview.measureNoDifferences'));
  a.style.fontSize = '16px';
  b.style.fontSize = '20px';
  a.style.opacity = '0.5';
  b.style.width = '80px';
  const before = [a.outerHTML, b.outerHTML];
  update({ ...initial, preview: b, slot: 'b' });
  expect(host.textContent).toContain(translate('content.designReview.measurePreview'));
  expect(host.textContent).toContain('A · 16px');
  expect(host.textContent).toContain('B · 20px');
  const fill = host.querySelector<HTMLDetailsElement>(
    '[data-ui="content.design-review.measure-difference.fill"]'
  )!;
  act(() => {
    fill.open = true;
    fill.dispatchEvent(new Event('toggle'));
  });
  expect(fill.open).toBe(true);
  expect(host.textContent).toContain('opacity');
  expect(host.textContent).toContain('A · 0.5');
  expect(host.textContent).toContain('B · 1');
  act(() => {
    fill.open = false;
    fill.dispatchEvent(new Event('toggle'));
  });
  expect(fill.open).toBe(false);
  const inside = target(110, 210);
  Object.defineProperty(inside, 'getBoundingClientRect', {
    configurable: true,
    value: () => DOMRect.fromRect({ x: 110, y: 210, width: 20, height: 10 }),
  });
  update({ ...initial, b: inside });
  expect(host.textContent).toContain(translate('content.designReview.measureOverlapX'));
  expect(host.textContent).toContain(translate('content.designReview.measureOverlapY'));
  expect(host.textContent).toContain(
    translate('content.designReview.measureInsets').replace('{outer}', 'A').replace('{inner}', 'B')
  );
  update({ ...initial, a: inside, b: a });
  expect(host.textContent).toContain(
    translate('content.designReview.measureInsets').replace('{outer}', 'B').replace('{inner}', 'A')
  );
  expect([a.outerHTML, b.outerHTML]).toEqual(before);
});

it('refreshes live measurements and stops scheduled sampling when inactive or unmounted', () => {
  let nextFrame: FrameRequestCallback | undefined;
  const request = vi.fn((callback: FrameRequestCallback) => {
    nextFrame = callback;
    return 42;
  });
  const cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const a = target(100, 200),
    b = target(216, 260);
  const state = { ...createDesignReviewMeasureState(), a, b, slot: null };
  const host = document.createElement('div');
  document.body.append(host);
  panelRoot = createRoot(host);
  function Live({ active, value }: { active: boolean; value?: DesignReviewMeasureState }) {
    const model = useDesignReviewMeasureModel(value, active);
    return (
      <output>
        {model.kind === 'ready'
          ? `${model.rectA.width}:${model.differences
              .flatMap((group) => group.values)
              .map((item) => item.b)
              .join(',')}`
          : model.kind}
      </output>
    );
  }
  act(() => panelRoot!.render(<Live active={false} />));
  expect(host.textContent).toBe('incomplete');
  expect(request).not.toHaveBeenCalled();
  act(() => panelRoot!.render(<Live active value={state} />));
  expect(host.textContent).toBe('100:');
  act(() => nextFrame!(0));
  expect(host.textContent).toBe('100:');
  b.style.fontSize = '24px';
  act(() => nextFrame!(0));
  expect(host.textContent).toContain('24px');
  b.remove();
  act(() => nextFrame!(0));
  expect(host.textContent).toBe('unavailable');
  act(() => panelRoot!.render(<Live active={false} value={state} />));
  expect(cancel).toHaveBeenCalledWith(42);
  act(() => panelRoot!.render(<Live active value={state} />));
  act(() => panelRoot!.unmount());
  panelRoot = undefined;
  expect(cancel).toHaveBeenCalledTimes(2);
});
