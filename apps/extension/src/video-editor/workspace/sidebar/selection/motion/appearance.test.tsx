// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditSpotlight } from '../../../../../features/video/project/scene/focus-appearance';
import { MotionEffectModeField } from './appearance';
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
