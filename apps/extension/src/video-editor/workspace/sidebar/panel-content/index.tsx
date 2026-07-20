import React from 'react';
import { WorkspaceSidebarPanelBody } from './body';
import {
  InspectorGroupHeaderSlotContext,
  type InspectorGroupHeaderSlot,
} from '../selection/grouped-inspector';
import type { WorkspaceSidebarPanelContentSharedProps } from '../contracts/panel-content';

function WorkspaceSidebarPanelSurface({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={[
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas))]',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function WorkspaceSidebarPanelContent(
  props: WorkspaceSidebarPanelContentSharedProps & {
    onSetInspectorHeaderSlot: React.Dispatch<React.SetStateAction<InspectorGroupHeaderSlot | null>>;
  }
) {
  const { inspectorMode, onSetInspectorHeaderSlot } = props;

  React.useEffect(() => {
    if (inspectorMode !== 'selection') {
      onSetInspectorHeaderSlot(null);
    }
  }, [inspectorMode, onSetInspectorHeaderSlot]);

  return (
    <WorkspaceSidebarPanelSurface>
      <InspectorGroupHeaderSlotContext.Provider value={onSetInspectorHeaderSlot}>
        <WorkspaceSidebarPanelBody {...props} />
      </InspectorGroupHeaderSlotContext.Provider>
    </WorkspaceSidebarPanelSurface>
  );
}
