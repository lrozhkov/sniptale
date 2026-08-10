import { expect, it } from 'vitest';
import type { WorkspaceSidebarSelectionPanelSourceProps } from './contracts/selection-panel';
import { createSelectionPanelOptionalProps } from './panel-content-selection-props';

it('builds supported optional actions without reviving cursor-detection capability', () => {
  const props = createSelectionPanelOptionalProps({} as WorkspaceSidebarSelectionPanelSourceProps);

  expect(props).not.toHaveProperty('cursorDetection');
  expect(props.onAddActionEvent).toBeTypeOf('function');
  expect(props.onEnableCursorTrack).toBeTypeOf('function');
  expect(props.onUpdateMotionRegion).toBeTypeOf('function');
});
