import { BookOpenText, CheckCircle2, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { ToolbarProps } from '../types';
import type { ToolbarMenuState } from '../state/menu';
import { ToolbarScenarioModeMenu } from './mode-menu';
import { ToolbarScenarioProjectMenu } from './project-menu';

type ScenarioToolbarProps = NonNullable<ToolbarProps['scenario']>;

function renderScenarioWorkflowActions(scenario: ScenarioToolbarProps) {
  return (
    <>
      <ContentToolbarButton
        onClick={() => void scenario.onFinishScenario()}
        title={translate('scenario.content.finish')}
        dataUi="content.toolbar.scenario-finish-button"
        aria-label={translate('scenario.content.finish')}
      >
        <CheckCircle2 className="h-[18px] w-[18px]" />
      </ContentToolbarButton>
      <ContentToolbarButton
        onClick={() => scenario.onOpenEditor()}
        title={translate('scenario.content.openEditor')}
        dataUi="content.toolbar.scenario-open-editor-button"
        aria-label={translate('scenario.content.openEditor')}
      >
        <BookOpenText className="h-[18px] w-[18px]" />
      </ContentToolbarButton>
    </>
  );
}

export function ToolbarScenarioControls(props: {
  compactMenus?: boolean;
  displayMode?: 'horizontal' | 'vertical';
  scenario: ScenarioToolbarProps;
  showWorkflowActions?: boolean;
  toolbarMenuState: ToolbarMenuState;
}) {
  const showWorkflowActions = props.showWorkflowActions ?? true;

  return (
    <>
      <ToolbarScenarioModeMenu
        byClickDisabled={props.scenario.byClickDisabled}
        captureMode={props.scenario.captureMode}
        compactMenus={props.compactMenus ?? false}
        displayMode={props.displayMode ?? 'horizontal'}
        onSetCaptureMode={props.scenario.onSetCaptureMode}
        sidebarVisible={props.scenario.sidebarVisible}
        toolbarMenuState={props.toolbarMenuState}
      />
      <ContentToolbarButton
        active={props.scenario.sidebarVisible}
        onClick={props.scenario.onToggleSidebar}
        title={
          props.scenario.sidebarVisible
            ? translate('scenario.content.sidebarHide')
            : translate('scenario.content.sidebarShow')
        }
        dataUi="content.toolbar.scenario-sidebar-button"
        aria-label={translate('scenario.content.sidebar')}
      >
        {props.scenario.sidebarVisible ? (
          <PanelRightOpen className="h-[18px] w-[18px]" />
        ) : (
          <PanelRightClose className="h-[18px] w-[18px]" />
        )}
      </ContentToolbarButton>
      <ToolbarScenarioProjectMenu
        displayMode={props.displayMode ?? 'horizontal'}
        scenario={props.scenario}
        toolbarMenuState={props.toolbarMenuState}
      />
      {showWorkflowActions ? renderScenarioWorkflowActions(props.scenario) : null}
    </>
  );
}
