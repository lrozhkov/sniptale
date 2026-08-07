import React from 'react';
import { BrushCleaning } from 'lucide-react';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import {
  ContentToolbarButton,
  ContentToolbarDivider,
  ContentToolbarGroup,
} from '@sniptale/ui/content-toolbar';
import { translate } from '../../../../platform/i18n';
import type { ToolbarAutoBlurProps } from '../types';
import type { ToolbarFutureFrameCalloutActions, ToolbarFutureFrameStyle } from '../types';
import type { ToolbarMenuState } from '../state/menu';
import { AutoBlurMenu } from './auto-blur-menu';
import { FutureFrameStyleControls } from './frame-style';
import type { EffectMode } from '../../../../features/highlighter/contracts';

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
  futureFrameStyle?: ToolbarFutureFrameStyle;
  onFutureFrameEffectModeChange?: (mode: EffectMode) => void;
  futureFrameCalloutActions?: ToolbarFutureFrameCalloutActions;
  futureFrameStepBadgeActions?: import('../types').ToolbarFutureFrameStepBadgeActions;
}) {
  const { autoBlur, highlighterMode, isLoading, framesCount, onClearHighlights } = props;
  const showPersistentAutoBlur = props.isCursorMode && autoBlur?.autoApplyAllowed === true;
  const showClearHighlights = highlighterMode;

  if (!highlighterMode && !showPersistentAutoBlur) {
    return null;
  }

  return (
    <ContentToolbarGroup className="sniptale-toolbar-highlighter-utilities" utilities>
      {highlighterMode && props.futureFrameStyle && props.onFutureFrameEffectModeChange ? (
        <>
          <FutureFrameStyleControls
            compactMenus={props.compactMenus}
            futureFrameStyle={props.futureFrameStyle}
            onFutureFrameEffectModeChange={props.onFutureFrameEffectModeChange}
            {...(props.futureFrameCalloutActions === undefined
              ? {}
              : { futureFrameCalloutActions: props.futureFrameCalloutActions })}
            {...(props.futureFrameStepBadgeActions === undefined
              ? {}
              : { futureFrameStepBadgeActions: props.futureFrameStepBadgeActions })}
            toolbarMenuState={props.toolbarMenuState}
          />
          <ContentToolbarDivider dataUi="content.toolbar.annotation-divider" />
        </>
      ) : null}
      {highlighterMode || showPersistentAutoBlur ? (
        <AutoBlurMenu
          autoBlur={autoBlur}
          compactMenus={props.compactMenus}
          displayMode={props.displayMode}
          isLoading={isLoading}
          sidebarVisible={props.sidebarVisible}
          toolbarMenuState={props.toolbarMenuState}
        />
      ) : null}
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
