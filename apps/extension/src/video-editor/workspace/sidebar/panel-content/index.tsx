import React from 'react';
import { WorkspaceSidebarPanelBody } from './body';
import type { WorkspaceSidebarPanelContentSharedProps } from '../contracts/panel-content';

function WorkspaceSidebarPanelSurface({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={[
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        '[--sniptale-compact-font-size:12px] [--sniptale-compact-control-height:32px]',
        '@min-[360px]/inspector:[--sniptale-compact-font-size:13px]',
        '@min-[360px]/inspector:[--sniptale-compact-control-height:36px]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas))]',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function WorkspaceSidebarPanelContent(props: WorkspaceSidebarPanelContentSharedProps) {
  return (
    <WorkspaceSidebarPanelSurface>
      <WorkspaceSidebarPanelBody {...props} />
    </WorkspaceSidebarPanelSurface>
  );
}
