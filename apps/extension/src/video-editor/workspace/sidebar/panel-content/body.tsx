import { GridSettingsPanel } from '../settings';
import type { WorkspaceSidebarPanelContentSharedProps } from '../contracts/panel-content';
import { createSelectionPanelProps, WorkspaceSidebarSelectionPanel } from './selection-panel';

export function WorkspaceSidebarPanelBody(props: WorkspaceSidebarPanelContentSharedProps) {
  switch (props.inspectorMode) {
    case 'grid':
      return (
        <GridSettingsPanel
          grid={props.gridSettings}
          recentColors={props.recentColors ?? []}
          onRememberRecentColor={props.onRememberRecentColor ?? (async () => undefined)}
        />
      );
    case 'selection':
      return <WorkspaceSidebarSelectionPanel {...createSelectionPanelProps(props)} />;
  }
}
