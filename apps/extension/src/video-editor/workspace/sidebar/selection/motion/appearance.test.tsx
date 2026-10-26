// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createQuickEditSpotlight,
  createQuickEditBorder,
} from '../../../../../features/video/project/scene/focus-appearance';
import { MotionEffectModeField, MotionFocusFields, MotionFocusAnimationFields } from './appearance';
import { createMotionPanelProps } from './test-support';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement, root: Root;
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
function render(spotlight = { ...createQuickEditSpotlight(), effect: 'magnify' as const }) {
  const panel = createMotionPanelProps({ spotlight });
  panel.onUpdateMotionRegion = vi.fn();
  act(() =>
    root.render(<MotionEffectModeField motionRegion={panel.selectedMotionRegion!} panel={panel} />)
  );
  return panel;
}
function chooseLens() {
  const lens = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === 'gallery.videoReview.focusLens'
  )!;
  act(() => lens.click());
}
it.each([undefined, 'circle', 'rounded'] as const)(
  'does not rewrite an active lens with shape %s',
  (lensShape) => {
    const spotlight = {
      ...createQuickEditSpotlight(),
      effect: 'magnify' as const,
      ...(lensShape ? { lensShape } : {}),
    };
    const before = JSON.stringify(spotlight);
    const panel = render(spotlight);
    chooseLens();
    expect(panel.onUpdateMotionRegion).not.toHaveBeenCalled();
    expect(JSON.stringify(spotlight)).toBe(before);
  }
);
it('creates a circle when activating a lens from a spotlight', () => {
  const panel = createMotionPanelProps({ spotlight: createQuickEditSpotlight() });
  panel.onUpdateMotionRegion = vi.fn();
  act(() =>
    root.render(<MotionEffectModeField motionRegion={panel.selectedMotionRegion!} panel={panel} />)
  );
  chooseLens();
  expect(panel.onUpdateMotionRegion).toHaveBeenCalledExactlyOnceWith(
    panel.selectedMotionRegion!.id,
    {
      focusEdit: {
        kind: 'spotlight',
        enabled: true,
        settings: { effect: 'magnify', magnification: 2, lensOptics: 'flat', lensShape: 'circle' },
      },
    }
  );
});

it('labels the shared origin and commits two-sided Native phases without direction controls', () => {
  const border = {
    ...createQuickEditBorder(),
    origin: 'top-left' as const,
    reveal: 'draw-both' as const,
    exitReveal: 'erase-both' as const,
  };
  const panel = createMotionPanelProps({ border });
  panel.onUpdateMotionRegion = vi.fn();
  act(() =>
    root.render(
      <>
        <MotionFocusFields motionRegion={panel.selectedMotionRegion!} panel={panel} />
        <MotionFocusAnimationFields motionRegion={panel.selectedMotionRegion!} panel={panel} />
      </>
    )
  );
  expect(host.textContent).toContain('gallery.videoReview.borderOrigin');
  const origin = host.querySelector<HTMLButtonElement>(
    '[title="gallery.videoReview.borderOrigin_bottom-right"]'
  )!;
  act(() => origin.click());
  expect(panel.onUpdateMotionRegion).toHaveBeenCalledWith(
    panel.selectedMotionRegion!.id,
    expect.objectContaining({ focusEdit: { kind: 'border', settings: { origin: 'bottom-right' } } })
  );
  expect(host.querySelector('[role="option"]')).toBeNull();
  expect(host.querySelector('[title="gallery.videoReview.borderClockwise"]')).toBeNull();
  const phases = [...host.querySelectorAll('fieldset')].filter(
    (node) => node.getAttribute('aria-label') !== 'gallery.videoReview.borderHold'
  );
  for (const phase of phases) {
    const both = phase.querySelector<HTMLButtonElement>(
      '[title="gallery.videoReview.borderBothSides"]'
    );
    if (!both) continue;
    act(() => both.click());
  }
  expect(panel.onUpdateMotionRegion).toHaveBeenCalledWith(
    panel.selectedMotionRegion!.id,
    expect.objectContaining({ focusEdit: { kind: 'border', settings: { reveal: 'draw-both' } } })
  );
  expect(panel.onUpdateMotionRegion).toHaveBeenCalledWith(
    panel.selectedMotionRegion!.id,
    expect.objectContaining({
      focusEdit: { kind: 'border', settings: { exitReveal: 'erase-both' } },
    })
  );
  expect(border.origin).toBe('top-left');
});
