import { expect, it } from 'vitest';
import { createFloatingWorkspaceController } from '../floating/top-panels.test-support';
import { getWorkspaceSidebarProps } from '../surface/sidebar-props';
import type { WorkspaceSidebarSelectionPanelSourceProps } from './contracts/selection-panel';
import {
  createSelectionPanelOptionalProps,
  createSelectionPanelOptionalUpdateProps,
} from './panel-content-selection-props';

it('builds supported optional actions without reviving cursor-detection capability', () => {
  const props = createSelectionPanelOptionalProps({} as WorkspaceSidebarSelectionPanelSourceProps);

  expect(props).not.toHaveProperty('cursorDetection');
  expect(props.onAddActionEvent).toBeTypeOf('function');
  expect(props.onEnableCursorTrack).toBeTypeOf('function');
  expect(props.onUpdateMotionRegion).toBeTypeOf('function');
});

it('preserves utility lane commands on the selection inspection path', () => {
  const controller = createFloatingWorkspaceController().sidebar;
  const source = getWorkspaceSidebarProps(controller);
  const props = createSelectionPanelOptionalUpdateProps({
    ...source,
    gridSettings: controller.state.gridSettings,
  });
  expect(props.onToggleUtilityLaneVisibility).toBe(
    controller.projectActions.onToggleUtilityLaneVisibility
  );
  expect(props.onToggleUtilityLaneLock).toBe(controller.projectActions.onToggleUtilityLaneLock);
  expect(props.onClearUtilityLane).toBe(controller.projectActions.onClearUtilityLane);
});
