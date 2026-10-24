// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PointerFeedbackFields } from './fields';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/project/action-feedback/validation';
import type { InspectorDisclosureProps } from '../compact-inspector-controls/shared';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
function Details(props: InspectorDisclosureProps) {
  return (
    <details data-preference={props.preferenceId}>
      <summary>{props.label}</summary>
      {props.children}
    </details>
  );
}
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

it('uses an immediate switch for a single gesture and patches only its display', () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <PointerFeedbackFields
        gesture
        part="animation"
        values={[{ ...REVIEW_CLICK_DEFAULT, effect: 'press', radius: 90 }]}
        Details={Details}
        onChange={change}
      />
    )
  );
  const display = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(display.getAttribute('aria-checked')).toBe('true');
  act(() => display.click());
  expect(change).toHaveBeenCalledExactlyOnceWith({ effect: 'off' });
  expect(host.textContent).not.toContain('gallery.videoReview.click_magnify');
});

it('represents mixed batch display with an indeterminate checkbox', () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <PointerFeedbackFields
        gesture
        part="animation"
        values={[REVIEW_CLICK_DEFAULT, { ...REVIEW_CLICK_DEFAULT, effect: 'press' }]}
        Details={Details}
        onChange={change}
      />
    )
  );
  expect(host.querySelector('[role="switch"]')).toBeNull();
  const display = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(display.indeterminate).toBe(true);
  act(() => display.click());
  expect(change).toHaveBeenCalledExactlyOnceWith({ effect: 'press' });
});

it('keeps disabled settings read-only through the controlled callback', () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <PointerFeedbackFields
        gesture
        part="animation"
        disabled
        values={[{ ...REVIEW_CLICK_DEFAULT, effect: 'press' }]}
        Details={Details}
        onChange={change}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  const path = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'gallery.videoReview.gesture_path'
  )!;
  act(() => path.click());
  expect(change).not.toHaveBeenCalled();
});

it('retains the runtime disclosure and excludes synthetic gesture timing and position', () => {
  const props = {
    gesture: true,
    values: [
      {
        ...REVIEW_CLICK_DEFAULT,
        effect: 'press' as const,
        gestureAppearance: 'area' as const,
        gestureArea: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 },
      },
    ],
    Details,
    onChange: vi.fn(),
  };
  act(() => root.render(<PointerFeedbackFields {...props} part="animation" />));
  expect(host.querySelector('details')?.getAttribute('data-preference')).toBe(
    'review-click:gesture-area'
  );
  expect(
    host.querySelector('input[aria-label="gallery.videoReview.gestureArea_x"]')
  ).not.toBeNull();
  act(() => root.render(<PointerFeedbackFields {...props} part="timing" />));
  expect(host.querySelector('input')).toBeNull();
  act(() => root.render(<PointerFeedbackFields {...props} part="position" />));
  expect(host.querySelector('input')).toBeNull();
  expect(props.onChange).not.toHaveBeenCalled();
});

it('shows a narrow default rim only for optical lenses and preserves the authored width', () => {
  const change = vi.fn();
  const render = (lensOptics: 'flat' | 'optical', lensEdgeWidth?: number) =>
    act(() =>
      root.render(
        <PointerFeedbackFields
          part="appearance"
          Details={Details}
          onChange={change}
          values={[
            {
              ...REVIEW_CLICK_DEFAULT,
              effect: 'magnify',
              lensOptics,
              ...(lensEdgeWidth === undefined ? {} : { lensEdgeWidth }),
            },
          ]}
        />
      )
    );
  render('flat');
  expect(host.querySelector('[aria-label="gallery.videoReview.clickLensEdgeWidth"]')).toBeNull();
  render('optical');
  expect(
    host.querySelector<HTMLInputElement>(
      'input[aria-label="gallery.videoReview.clickLensEdgeWidth"]'
    )?.value
  ).toBe('8');
  render('optical', 4);
  expect(
    host.querySelector<HTMLInputElement>(
      'input[aria-label="gallery.videoReview.clickLensEdgeWidth"]'
    )?.value
  ).toBe('4');
  expect(change).not.toHaveBeenCalled();
});
