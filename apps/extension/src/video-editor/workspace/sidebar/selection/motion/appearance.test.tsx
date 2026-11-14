// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditBorder } from '../../../../../features/video/project/scene/focus-appearance';
import { MotionFocusFields, MotionFocusAnimationFields } from './appearance';
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
