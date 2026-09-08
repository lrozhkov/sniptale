import { createSelectionPanelProps } from './panel-content/selection-panel';
import { expect, it, vi } from 'vitest';
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

it('carries camera commands and live eligibility from surface props to the actual selection panel', () => {
  const controller = createFloatingWorkspaceController().sidebar;
  const onApplyCameraLayout = vi.fn();
  const onEditCameraPosition = vi.fn();
  controller.clipActions.onApplyCameraLayout = onApplyCameraLayout;
  controller.clipActions.onEditCameraPosition = onEditCameraPosition;
  controller.state.canAddCameraPosition = true;
  const source = getWorkspaceSidebarProps(controller);
  const props = createSelectionPanelProps({
    ...source,
    gridSettings: controller.state.gridSettings,
  });
  expect(props.canAddCameraPosition).toBe(true);
  props.onApplyCameraLayout?.('camera-interval', 'FULLFRAME');
  props.onEditCameraPosition?.('camera-interval', { kind: 'add' });
  expect(onApplyCameraLayout).toHaveBeenCalledWith('camera-interval', 'FULLFRAME');
  expect(onEditCameraPosition).toHaveBeenCalledWith('camera-interval', { kind: 'add' });
  controller.state.canAddCameraPosition = false;
  const atBoundary = createSelectionPanelProps({
    ...getWorkspaceSidebarProps(controller),
    gridSettings: controller.state.gridSettings,
  });
  expect(atBoundary.canAddCameraPosition).toBe(false);
});
