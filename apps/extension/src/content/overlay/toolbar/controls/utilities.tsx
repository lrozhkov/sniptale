import { PageToolbarGroup, PageToolbarDivider } from './page-layout';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import type { ToolbarAutoBlurProps } from '../types';
import type { ToolbarFutureFrameCalloutActions, ToolbarFutureFrameStyle } from '../types';
import type { ToolbarMenuState } from '../state/menu';
import { AutoBlurMenu } from './auto-blur-menu';
import { FutureFrameStyleControls } from './frame-style';
import type { EffectMode } from '../../../../features/highlighter/contracts';
import { useContext } from 'react';
import { PageToolbarControlsContext } from '../state/page-controls';
import { PageControlVisibility } from './control-visibility';
import { translate } from '../../../../platform/i18n';

export function ToolbarUtilityButtons(props: {
  screenshotMode: boolean;
  isCursorMode: boolean;
  highlighterMode: boolean;
  isLoading: boolean;
  navigationLockEnabled: boolean;
  lockDisabled: boolean;
  toggleNavigationLock: () => void;
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
  const { autoBlur, highlighterMode, isLoading } = props;
  const visibility = useContext(PageToolbarControlsContext);
  const autoBlurVisible = visibility?.isVisible('auto-blur') !== false;
  const showPersistentAutoBlur = props.isCursorMode && autoBlur !== undefined;

  if (!highlighterMode && (!showPersistentAutoBlur || !autoBlurVisible)) {
    return null;
  }

  return (
    <PageToolbarGroup className="sniptale-toolbar-highlighter-utilities" utilities>
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
          {autoBlurVisible ? (
            <PageToolbarDivider dataUi="content.toolbar.annotation-divider" />
          ) : null}
        </>
      ) : null}
      {highlighterMode || showPersistentAutoBlur ? (
        <PageControlVisibility control="auto-blur" label={translate('content.toolbar.autoBlur')}>
          <AutoBlurMenu
            autoBlur={autoBlur}
            compactMenus={props.compactMenus}
            displayMode={props.displayMode}
            isLoading={isLoading}
            sidebarVisible={props.sidebarVisible}
            toolbarMenuState={props.toolbarMenuState}
          />
        </PageControlVisibility>
      ) : null}
    </PageToolbarGroup>
  );
}
