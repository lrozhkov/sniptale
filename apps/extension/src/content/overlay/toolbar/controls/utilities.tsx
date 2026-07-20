import React from 'react';
import { BrushCleaning } from 'lucide-react';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import { ContentToolbarButton, ContentToolbarGroup } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../../platform/i18n';
import type { ToolbarAutoBlurProps } from '../types';
import type { ToolbarMenuState } from '../state/menu';
import { AutoBlurMenu } from './auto-blur-menu';

function ClearHighlightsButton(props: {
  framesCount: number;
  isLoading: boolean;
  onClearHighlights: () => void;
}) {
  return (
    <ContentToolbarButton
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        props.onClearHighlights();
      }}
      disabled={props.isLoading || props.framesCount === 0}
      tone="danger"
      dataUi="content.toolbar.clear-frames-button"
      title={translate('content.toolbar.clearFrames')}
    >
      <BrushCleaning size={20} strokeWidth={2} />
    </ContentToolbarButton>
  );
}

export function ToolbarUtilityButtons(props: {
  screenshotMode: boolean;
  isCursorMode: boolean;
  highlighterMode: boolean;
  isLoading: boolean;
  framesCount: number;
  navigationLockEnabled: boolean;
  lockDisabled: boolean;
  toggleNavigationLock: () => void;
  onClearHighlights: () => void;
  toolbarMenuState: ToolbarMenuState;
  autoBlur?: ToolbarAutoBlurProps;
  compactMenus: boolean;
  displayMode: ContentToolbarDisplayMode;
  sidebarVisible: boolean;
}) {
  const { autoBlur, highlighterMode, isLoading, framesCount, onClearHighlights } = props;
  const showClearHighlights = highlighterMode;

  if (!highlighterMode) {
    return null;
  }

  return (
    <ContentToolbarGroup utilities>
      <AutoBlurMenu
        autoBlur={autoBlur}
        compactMenus={props.compactMenus}
        displayMode={props.displayMode}
        isLoading={isLoading}
        sidebarVisible={props.sidebarVisible}
        toolbarMenuState={props.toolbarMenuState}
      />
      {showClearHighlights ? (
        <ClearHighlightsButton
          framesCount={framesCount}
          isLoading={isLoading}
          onClearHighlights={onClearHighlights}
        />
      ) : null}
    </ContentToolbarGroup>
  );
}
