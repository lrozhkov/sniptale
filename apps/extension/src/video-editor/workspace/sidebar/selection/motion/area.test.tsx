import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { VideoMotionFocusMode } from '../../../../../features/video/project/types';
import { ManualAreaFields } from './area';
import { createMotionPanelProps } from './test-support';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

describe('workspace-sidebar/selection/motion-area', () => {
  it('renders manual focus area coordinates as a single-column numeric stack with stage actions', () => {
    const panel = createMotionPanelProps({
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
      focusArea: { x: 120, y: 160, width: 640, height: 360 },
    });
    const motionRegion = panel.selectedMotionRegion;
    if (!motionRegion) {
      throw new Error('Expected motion region fixture');
    }

    const markup = renderToStaticMarkup(
      <ManualAreaFields motionRegionId={motionRegion.id} panel={panel} />
    );

    expect(markup).toContain('videoEditor.sidebar.motionAreaXLabel');
    expect(markup).toContain('videoEditor.sidebar.motionAreaWidthLabel');
    expect(markup).toContain('videoEditor.sidebar.selectAreaOnStage');
    expect(markup).toContain('videoEditor.sidebar.resetAreaToCenter');
  });
});
