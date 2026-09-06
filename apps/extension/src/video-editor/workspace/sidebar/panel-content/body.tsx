import type { WorkspaceSidebarPanelContentSharedProps } from '../contracts/panel-content';
import { createSelectionPanelProps, WorkspaceSidebarSelectionPanel } from './selection-panel';

export function WorkspaceSidebarPanelBody(props: WorkspaceSidebarPanelContentSharedProps) {
  return <WorkspaceSidebarSelectionPanel {...createSelectionPanelProps(props)} />;
}
