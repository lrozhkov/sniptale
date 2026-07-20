import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useState } from 'react';

import { translate } from '../../../platform/i18n';
import {
  InspectorShellHeaderAction,
  InspectorShellHeaderSegment,
} from '@sniptale/ui/inspector-shell';
import {
  SCENARIO_EDITOR_NAVIGATOR_COLLAPSED_WIDTH_CLASS,
  SCENARIO_EDITOR_NAVIGATOR_EXPANDED_WIDTH_CLASS,
} from '../layout/constants';
import type { ScenarioEditorToolbarController } from './types';

function getProjectSummaryName(controller: ScenarioEditorToolbarController): string {
  return (
    controller.project.project?.name ??
    controller.project.error ??
    translate('scenario.editor.title')
  );
}

function CollapsedSummaryButton(props: { onExpand: () => void; title: string }) {
  const expandLabel = `${translate('scenario.editor.expandNavigator')} ${props.title}`;

  return (
    <InspectorShellHeaderAction
      title={expandLabel}
      onClick={props.onExpand}
      dataUi="scenario.toolbar.expand-button"
    >
      <PanelLeftOpen size={16} strokeWidth={2.2} />
    </InspectorShellHeaderAction>
  );
}

function ProjectNameField(props: {
  controller: ScenarioEditorToolbarController;
  projectName: string;
}) {
  const [draftName, setDraftName] = useState(props.projectName);

  useEffect(() => {
    setDraftName(props.projectName);
  }, [props.projectName]);

  return (
    <input
      value={draftName}
      onChange={(event) => setDraftName(event.target.value)}
      onBlur={() => void props.controller.projectCrud.renameProject(draftName)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
          return;
        }

        if (event.key === 'Escape') {
          setDraftName(props.projectName);
          event.currentTarget.blur();
        }
      }}
      className="min-w-0 rounded-[10px] border border-transparent bg-transparent px-2 py-1
        text-sm font-semibold text-[var(--sniptale-color-text-primary)] outline-none transition
        focus:border-[var(--sniptale-color-border-accent-strong)] focus:bg-[var(--sniptale-color-surface-panel)]"
      aria-label={translate('scenario.editor.renameProject')}
    />
  );
}

function ExpandedSummary(props: {
  controller: ScenarioEditorToolbarController;
  projectName: string;
}) {
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="grid min-w-0 flex-1 text-left">
          <span
            className={[
              'text-[10px] font-semibold uppercase tracking-[0.12em]',
              'text-[var(--sniptale-color-text-muted)]',
            ].join(' ')}
          >
            {translate('scenario.editor.projectLabel')}
          </span>
          <ProjectNameField controller={props.controller} projectName={props.projectName} />
        </div>
      </div>
      <InspectorShellHeaderAction
        title={translate('scenario.editor.collapseNavigator')}
        onClick={() => props.controller.ui.setNavigatorCollapsed(true)}
        className="ml-2"
        dataUi="scenario.toolbar.collapse-button"
      >
        <PanelLeftClose size={16} strokeWidth={2} />
      </InspectorShellHeaderAction>
    </>
  );
}

export function ScenarioToolbarProjectSummary(props: {
  controller: ScenarioEditorToolbarController;
}) {
  const projectName = getProjectSummaryName(props.controller);
  const collapsed = props.controller.ui.navigatorCollapsed;

  return (
    <InspectorShellHeaderSegment
      collapsed={collapsed}
      expandedWidthClassName={SCENARIO_EDITOR_NAVIGATOR_EXPANDED_WIDTH_CLASS}
      collapsedWidthClassName={SCENARIO_EDITOR_NAVIGATOR_COLLAPSED_WIDTH_CLASS}
      className={collapsed ? 'justify-center px-0' : 'px-3'}
      dataUi="scenario.toolbar.project-summary"
    >
      {collapsed ? (
        <CollapsedSummaryButton
          title={projectName}
          onExpand={() => props.controller.ui.setNavigatorCollapsed(false)}
        />
      ) : (
        <ExpandedSummary controller={props.controller} projectName={projectName} />
      )}
    </InspectorShellHeaderSegment>
  );
}
