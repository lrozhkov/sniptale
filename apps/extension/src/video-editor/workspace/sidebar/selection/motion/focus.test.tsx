import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ManualFocusFields } from './focus';
import { createMotionPanelProps } from './test-support';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

describe('workspace-sidebar/selection/motion-focus', () => {
  it('renders manual focus coordinates as a single-column numeric stack with stage actions', () => {
    const panel = createMotionPanelProps();
    const motionRegion = panel.selectedMotionRegion;
    if (!motionRegion) {
      throw new Error('Expected motion region fixture');
    }

    const markup = renderToStaticMarkup(
      <ManualFocusFields motionRegionId={motionRegion.id} panel={panel} />
    );

    expect(markup).toContain('videoEditor.sidebar.motionFocusXLabel');
    expect(markup).toContain('videoEditor.sidebar.motionFocusYLabel');
    expect(markup).toContain('videoEditor.sidebar.selectPointOnStage');
    expect(markup).toContain('videoEditor.sidebar.resetPointToCenter');
  });
});
