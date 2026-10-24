// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditSpotlight } from '../../features/video/project/scene/focus-appearance';
import { translate } from '../../platform/i18n';
import { SpotlightAppearanceFields } from './spotlight';

let host: HTMLDivElement;
let root: Root;
const change = vi.fn(),
  preview = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  change.mockClear();
  preview.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function render(shape?: 'circle' | 'rounded') {
  act(() =>
    root.render(
      <SpotlightAppearanceFields
        value={{
          ...createQuickEditSpotlight(),
          effect: 'magnify',
          ...(shape ? { lensShape: shape } : {}),
        }}
        onChange={change}
        onPreview={preview}
        preferenceId="lens-test"
        Details={({ children }) => <div>{children}</div>}
      />
    )
  );
}
it('uses diameter for a circle and rectangular geometry for explicit and legacy rectangles', () => {
  const diameter = () =>
    host.querySelector(`input[aria-label="${translate('gallery.videoReview.focusLensDiameter')}"]`);
  const roundness = () =>
    host.querySelector(`input[aria-label="${translate('gallery.videoReview.focusRoundness')}"]`);
  render('circle');
  expect(diameter()).not.toBeNull();
  expect(roundness()).toBeNull();
  for (const shape of ['rounded', undefined] as const) {
    render(shape);
    expect(diameter()).toBeNull();
    expect(roundness()).not.toBeNull();
  }
  const rectangle = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === translate('gallery.videoReview.focusLensRounded')
  )!;
  act(() => rectangle.click());
  expect(change).not.toHaveBeenCalled();
  const circle = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === translate('gallery.videoReview.clickLens_circle')
  )!;
  act(() => circle.click());
  expect(change).toHaveBeenCalledExactlyOnceWith({ lensShape: 'circle' });
});
it('previews diameter, cancels without writing, then commits one centered size change', () => {
  render('circle');
  const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
  const key = (type: string, key: string) =>
    act(() => range.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true })));
  key('keydown', 'ArrowRight');
  expect(change).not.toHaveBeenCalled();
  const area = preview.mock.lastCall?.[0].area;
  expect(area.width).toBeCloseTo(0.51);
  expect(area.x + area.width / 2).toBeCloseTo(0.5);
  key('keydown', 'Escape');
  key('keyup', 'ArrowRight');
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(change).not.toHaveBeenCalled();
  key('keydown', 'ArrowRight');
  key('keyup', 'ArrowRight');
  expect(change).toHaveBeenCalledExactlyOnceWith({ area });
});
