import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { cx } from '../../../ui/compact-inspector-controls';
import {
  InspectorShellHeaderAction,
  InspectorShellHeaderSegment,
  INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS,
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
} from '@sniptale/ui/inspector-shell';

function CollapsedInspectorButton(props: { title: string; onExpand: () => void }) {
  return (
    <InspectorShellHeaderAction
      title={`${translate('editor.toolbar.expandInspectorPrefix')} ${props.title}`}
      onClick={props.onExpand}
      dataUi="editor.toolbar.expand-button"
    >
      <PanelLeftOpen size={16} strokeWidth={2.2} />
    </InspectorShellHeaderAction>
  );
}

function ExpandedInspectorSummary(props: {
  subtitle: string;
  title: string;
  onCollapse: () => void;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold leading-snug text-[var(--sniptale-color-text-primary)]">
          {props.title}
        </div>
        <div className="truncate text-xs leading-snug text-[var(--sniptale-color-text-muted)]">
          {props.subtitle}
        </div>
      </div>
      <InspectorShellHeaderAction
        title={translate('editor.toolbar.collapseInspector')}
        onClick={props.onCollapse}
        className="ml-2"
        dataUi="editor.toolbar.collapse-button"
      >
        <PanelLeftClose size={16} strokeWidth={2} />
      </InspectorShellHeaderAction>
    </>
  );
}

export function EditorToolbarInspectorSummary(props: {
  inspectorCollapsed: boolean;
  subtitle: string;
  title: string;
  onCollapse: () => void;
  onExpand: () => void;
}) {
  return (
    <InspectorShellHeaderSegment
      collapsed={props.inspectorCollapsed}
      expandedWidthClassName={INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS}
      collapsedWidthClassName={INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS}
      className={cx(props.inspectorCollapsed ? 'justify-center px-0' : 'px-3')}
      dataUi="editor.toolbar.inspector-summary"
    >
      {props.inspectorCollapsed ? (
        <CollapsedInspectorButton title={props.title} onExpand={props.onExpand} />
      ) : (
        <ExpandedInspectorSummary
          subtitle={props.subtitle}
          title={props.title}
          onCollapse={props.onCollapse}
        />
      )}
    </InspectorShellHeaderSegment>
  );
}
