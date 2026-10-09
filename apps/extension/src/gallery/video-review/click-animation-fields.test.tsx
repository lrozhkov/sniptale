import { ReviewInspectorPresentation } from './inspector-sections';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ReviewClickFields } from './click-animation-fields';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/review/advanced/click-animation';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
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
  vi.unstubAllGlobals();
});
const click = { ...REVIEW_CLICK_DEFAULT, effect: 'ripple' as const };
const field = (name: string, type = 'text') =>
  host.querySelector<HTMLInputElement>(
    `input[type="${type}"][aria-label="gallery.videoReview.${name}${type === 'range' ? ' range' : ''}"]`
  )!;
function input(node: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
  node.dispatchEvent(new Event('input', { bubbles: true }));
}

it('provides common slider ranges while accepting larger typed values', () => {
  const change = vi.fn();
  act(() => root.render(<ReviewClickFields values={[click]} onChange={change} />));
  expect(host.querySelectorAll('input[type="range"]')).toHaveLength(8);
  const radius = field('clickRadius', 'range');
  expect(radius.min).toBe('2');
  expect(radius.max).toBe('80');
  act(() => {
    field('clickRadius').focus();
    input(field('clickRadius'), '150');
  });
  act(() =>
    field('clickRadius').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    )
  );
  expect(change).toHaveBeenCalledExactlyOnceWith({ radius: 150 });
  expect(host.contains(document.activeElement)).toBe(false);
});

it('shows slider drafts locally and commits one changed field for mixed selections', () => {
  const change = vi.fn();
  act(() =>
    root.render(<ReviewClickFields values={[click, { ...click, radius: 40 }]} onChange={change} />)
  );
  expect(field('clickRadius').placeholder).toBe('—');
  const range = field('clickRadius', 'range');
  expect(range).not.toBeNull();
  act(() => input(range, '50'));
  expect(field('clickRadius').value).toBe('50');
  act(() => input(range, '60'));
  expect(change).not.toHaveBeenCalled();
  act(() => range.dispatchEvent(new Event('pointerup', { bubbles: true })));
  expect(change).toHaveBeenCalledExactlyOnceWith({ radius: 60 });
});

it('exposes only effective appearance controls and preserves fractional position input', () => {
  const change = vi.fn();
  act(() => root.render(<ReviewClickFields values={[click]} onChange={change} />));
  expect(field('clickOpacity')).toBeNull();
  expect(field('clickX', 'range').min).toBe('-10');
  expect(field('clickX', 'range').max).toBe('10');
  act(() => input(field('clickX', 'range'), '0.84'));
  expect(field('clickX').value).toBe('0.8');
  act(() => {
    field('clickX').focus();
    input(field('clickX'), '0.5');
  });
  act(() =>
    field('clickX').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(change).toHaveBeenLastCalledWith({ x: 0.005 });
  for (const effect of ['press', 'glow'] as const) {
    act(() => root.render(<ReviewClickFields values={[{ ...click, effect }]} onChange={change} />));
    expect(field('clickStroke')).toBeNull();
  }
});

it('shows lens controls with fractional magnification and no repeated pulses', () => {
  const change = vi.fn();
  act(() =>
    root.render(<ReviewClickFields values={[{ ...click, effect: 'magnify' }]} onChange={change} />)
  );
  expect(field('clickMagnification').value).toBe('1.6');
  expect(field('clickRadius', 'range').max).toBe('160');
  expect(field('clickPulses')).toBeNull();
  expect(field('clickLensShadow').value).toBe('20');
  expect(field('clickStroke')).not.toBeNull();
  act(() => {
    field('clickMagnification').focus();
    input(field('clickMagnification'), '2.3');
  });
  act(() =>
    field('clickMagnification').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    )
  );
  expect(change).toHaveBeenCalledWith({ magnification: 2.3 });
});

it('starts with recorded information and falls back when an effect removes the active section', () => {
  const change = vi.fn();
  const render = (effect: 'ripple' | 'off') =>
    act(() =>
      root.render(
        <ReviewInspectorPresentation value="sections" section="selected" selectionScope="telemetry">
          <ReviewClickFields
            information={
              <dl>
                <dt>Recorded time</dt>
                <dd>01.00</dd>
              </dl>
            }
            values={[{ ...click, effect }]}
            onChange={change}
          />
        </ReviewInspectorPresentation>
      )
    );
  render('ripple');
  expect(host.querySelector('[data-section="information"] dl')?.textContent).toContain('01.00');
  const timing = Array.from(host.querySelectorAll('button')).find(
    (node) => node.getAttribute('aria-label') === 'gallery.videoReview.clickTiming'
  )!;
  act(() => timing.click());
  expect(host.querySelector('[data-section="timing"]')).not.toBeNull();
  render('off');
  expect(host.querySelector('[data-section="timing"]')).toBeNull();
  expect(host.querySelector('[data-section="information"]')).not.toBeNull();
  expect(change).not.toHaveBeenCalled();
});

it('remembers the chosen section when returning to the same inspector family', () => {
  const change = vi.fn();
  const render = (visible: boolean) =>
    root.render(
      <ReviewInspectorPresentation value="sections" section="selected" selectionScope="telemetry">
        {visible ? (
          <ReviewClickFields information={<p>Facts</p>} values={[click]} onChange={change} />
        ) : (
          <p>Other surface</p>
        )}
      </ReviewInspectorPresentation>
    );
  act(() => render(true));
  act(() =>
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.clickTiming"]')!.click()
  );
  expect(host.querySelector('[data-section="timing"]')).not.toBeNull();
  act(() => render(false));
  act(() => render(true));
  expect(host.querySelector('[data-section="timing"]')).not.toBeNull();
  expect(change).not.toHaveBeenCalled();
});
