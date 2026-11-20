// @vitest-environment jsdom
import { ReviewInspectorPresentation } from './inspector-sections';
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
function openSection(id: string) {
  const tab = host.querySelector<HTMLButtonElement>(`[role="tab"][aria-controls$="-${id}"]`);
  if (tab) act(() => tab.click());
}
const field = (name: string, type = 'text') => {
  const selector = `input[type="${type}"][aria-label="gallery.videoReview.${name}${type === 'range' ? ' range' : ''}"]`;
  let found = host.querySelector<HTMLInputElement>(selector);
  if (found) return found;
  for (const tab of host.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
    act(() => tab.click());
    found = host.querySelector<HTMLInputElement>(selector);
    if (found) return found;
  }
  return null!;
};

function input(node: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
  node.dispatchEvent(new Event('input', { bubbles: true }));
}

function commitField(node: HTMLInputElement) {
  node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

it('accepts typed radius values within the authored bounds and clamps excess input', () => {
  const change = vi.fn();
  act(() => root.render(<ReviewClickFields values={[click]} onChange={change} />));
  const radius = field('clickRadius');
  act(() => {
    radius.focus();
    input(radius, '150');
    commitField(radius);
  });
  expect(change).toHaveBeenCalledExactlyOnceWith({ radius: 150 });
  expect(host.contains(document.activeElement)).toBe(false);
  act(() => {
    radius.focus();
    input(radius, '201');
    commitField(radius);
  });
  expect(change).toHaveBeenLastCalledWith({ radius: 200 });
});

it('shows numeric drafts locally and commits one changed field for mixed selections', () => {
  const change = vi.fn();
  act(() =>
    root.render(<ReviewClickFields values={[click, { ...click, radius: 40 }]} onChange={change} />)
  );
  const radius = field('clickRadius');
  expect(radius.placeholder).toBe('—');
  act(() => {
    radius.focus();
    input(radius, '50');
  });
  expect(radius.value).toBe('50');
  act(() => input(radius, '60'));
  expect(change).not.toHaveBeenCalled();
  act(() => commitField(radius));
  expect(change).toHaveBeenCalledExactlyOnceWith({ radius: 60 });
});

it('exposes only effective appearance controls and preserves fractional position input', () => {
  const change = vi.fn();
  act(() => root.render(<ReviewClickFields values={[click]} onChange={change} />));
  openSection('appearance');
  expect(field('clickOpacity')).toBeNull();
  const horizontal = field('clickX');
  act(() => {
    horizontal.focus();
    input(horizontal, '0.84');
  });
  expect(horizontal.value).toBe('0.84');
  expect(change).not.toHaveBeenCalled();
  act(() => commitField(horizontal));
  expect(change).toHaveBeenCalledExactlyOnceWith({ x: 0.0084 });
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
  expect(field('clickMagnification', 'range').min).toBe('1');
  expect(field('clickMagnification', 'range').max).toBe('2.5');
  expect(field('clickPulses')).toBeNull();
  openSection('appearance');
  const shadow = host.querySelector<HTMLInputElement>(
    'input[type="range"][aria-label="gallery.videoReview.clickLensShadow"]'
  );
  expect(shadow?.value).toBe('20');
  expect(host.textContent).toContain('gallery.videoReview.clickLensOptics_optical');
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

it('starts with animation, keeps information last and falls back when an effect removes the active section', () => {
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
  expect(host.querySelector('[data-section="animation"]')).not.toBeNull();
  const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  expect(tabs.at(-1)?.getAttribute('aria-controls')).toMatch(/-information$/);
  act(() => tabs.at(-1)!.click());
  expect(host.querySelector('[data-section="information"] dl')?.textContent).toContain('01.00');
  const timing = Array.from(host.querySelectorAll('button')).find(
    (node) => node.getAttribute('aria-label') === 'gallery.videoReview.clickTiming'
  )!;
  act(() => timing.click());
  expect(host.querySelector('[data-section="timing"]')).not.toBeNull();
  render('off');
  expect(host.querySelector('[data-section="timing"]')).toBeNull();
  expect(host.querySelector('[data-section="animation"]')).not.toBeNull();
  act(() =>
    host.querySelector<HTMLButtonElement>('[role="tab"][aria-controls$="-information"]')!.click()
  );
  expect(host.querySelector('[data-section="information"] dl')?.textContent).toContain('01.00');
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

it('offers factual hold appearance without inapplicable pulse timing or pointer offset controls', () => {
  act(() => root.render(<ReviewClickFields gesture values={[click]} onChange={vi.fn()} />));
  expect(host.querySelector('[aria-label="gallery.videoReview.gestureAppearance"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="gallery.videoReview.clickBefore"]')).toBeNull();
  expect(host.querySelector('[aria-label="gallery.videoReview.clickX"]')).toBeNull();
  const display = host.querySelector('[aria-label="gallery.videoReview.gestureFeedback"]');
  expect(display?.getAttribute('role')).toBe('switch');
  expect(display?.getAttribute('aria-checked')).toBe('true');
  expect(host.textContent).not.toContain('gallery.videoReview.click_magnify');
});

it('puts editable frame geometry in a disclosure and enforces its bounds', () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <ReviewClickFields
        gesture
        values={[
          {
            ...click,
            gestureAppearance: 'area',
            gestureArea: { x: 0.2, y: 0.3, width: 0.5, height: 0.3 },
          },
        ]}
        onChange={change}
      />
    )
  );
  const position = field('gestureArea_x');
  const details = position.closest('details');
  expect(details?.open).toBe(false);
  act(() => details?.querySelector('summary')?.click());
  expect(details?.open).toBe(true);
  act(() => {
    position.focus();
    input(position, '60');
  });
  expect(change).not.toHaveBeenCalled();
  act(() => commitField(position));
  expect(change).toHaveBeenCalledExactlyOnceWith({
    gestureArea: { x: 0.5, y: 0.3, width: 0.5, height: 0.3 },
  });
});
