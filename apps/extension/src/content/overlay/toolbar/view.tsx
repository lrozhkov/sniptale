import React from 'react';
import { useAppLocale } from '../../../platform/i18n';
import { ToolbarShellContent } from './shell/view';
import { handleToolbarViewportChange } from './shell/viewport-change';
import { useToolbarViewModel } from './state/view-model';
import type { ToolbarProps } from './types';

export const Toolbar: React.FC<ToolbarProps> = (props) => {
  useAppLocale();
  const viewModel = useToolbarViewModel(props);

  const handleToolbarHoverCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest(
      '.sniptale-btn[data-tooltip]'
    ) as HTMLElement | null;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const tooltipHeight = 44;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    button.dataset['tooltipPosition'] =
      spaceBelow < tooltipHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';
  };

  const handleViewportChange = (viewport: { width: number; height: number } | null) =>
    void handleToolbarViewportChange(viewport, viewModel.derivedState.setCurrentViewport);

  return (
    <ToolbarShellContent
      toolbarProps={props}
      viewModel={viewModel}
      onHoverCapture={handleToolbarHoverCapture}
      onViewportChange={handleViewportChange}
    />
  );
};
