import { translate } from '../../../../../../platform/i18n';
import type { WorkspaceSidebarSelectionPanelProps } from '../../../contracts/selection-panel';
import {
  ActionPointButtons,
  ActionPointFields,
  ActionPrimaryFields,
  DangerButton,
} from '../fields';
import { InspectorGroupedPanel } from '../../grouped-inspector';
import { SelectionEmptyState } from '../../inspection/helpers';
import {
  DetailItem,
  DetailList,
  PANEL_HEADING_CLASS_NAME,
  PANEL_META_CLASS_NAME,
  PANEL_SECTION_CLASS_NAME,
} from '../../shared/panel';

type SelectedActionEvent = NonNullable<WorkspaceSidebarSelectionPanelProps['selectedActionEvent']>;

export function InspectActionPanel(props: WorkspaceSidebarSelectionPanelProps) {
  const actionEvent = props.selectedActionEvent;
  if (!actionEvent) {
    return <SelectionEmptyState />;
  }

  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <InspectorGroupedPanel groups={createActionGroups(props, actionEvent)} />
      <DangerButton
        className="mt-3"
        onClick={() => props.onDeleteActionEvent(actionEvent.id)}
        label={translate('common.actions.delete')}
      />
    </section>
  );
}

function createActionGroups(
  props: WorkspaceSidebarSelectionPanelProps,
  actionEvent: SelectedActionEvent
) {
  const point = actionEvent.point ?? {
    x: props.project.width / 2,
    y: props.project.height / 2,
  };

  return [
    {
      id: 'info',
      label: translate('videoEditor.sidebar.inspectorGroupInfo'),
      content: <ActionOverview actionEvent={actionEvent} />,
    },
    {
      id: 'general',
      label: translate('videoEditor.sidebar.inspectorGroupGeneral'),
      defaultActive: true,
      content: <ActionPrimaryFields {...createActionPrimaryProps(props, actionEvent)} />,
    },
    {
      id: 'placement',
      label: translate('videoEditor.sidebar.inspectorGroupPlacement'),
      content: <ActionPlacementFields actionEvent={actionEvent} point={point} props={props} />,
    },
  ] as const;
}

function createActionPrimaryProps(
  props: WorkspaceSidebarSelectionPanelProps,
  actionEvent: SelectedActionEvent
) {
  return {
    actionEventId: actionEvent.id,
    duration: actionEvent.duration,
    label: actionEvent.label,
    preset: actionEvent.preset,
    onUpdateActionEventDetails: props.onUpdateActionEventDetails,
  };
}

function ActionPlacementFields(props: {
  actionEvent: SelectedActionEvent;
  point: { x: number; y: number };
  props: WorkspaceSidebarSelectionPanelProps;
}) {
  return (
    <div className="space-y-3">
      <ActionPointFields
        actionEventId={props.actionEvent.id}
        point={props.point}
        projectHeight={props.props.project.height}
        projectWidth={props.props.project.width}
        onUpdateActionEventDetails={props.props.onUpdateActionEventDetails}
      />
      <ActionPointButtons
        actionEventId={props.actionEvent.id}
        placementModeKind={props.props.placementMode?.kind ?? null}
        projectHeight={props.props.project.height}
        projectWidth={props.props.project.width}
        onClearPlacementMode={props.props.onClearPlacementMode}
        onStartActionPointPlacement={props.props.onStartActionPointPlacement}
        onUpdateActionEventDetails={props.props.onUpdateActionEventDetails}
      />
    </div>
  );
}

function ActionOverview(props: { actionEvent: SelectedActionEvent }) {
  return (
    <>
      <p className={PANEL_HEADING_CLASS_NAME}>{translate('videoEditor.timeline.actionsLane')}</p>
      <p className={`mt-1 ${PANEL_META_CLASS_NAME}`}>{props.actionEvent.label || '—'}</p>
      <div className="mt-3">
        <DetailList>
          <DetailItem
            label={translate('videoEditor.sidebar.actionTimePrefix')}
            value={`${props.actionEvent.time.toFixed(2)} s`}
          />
          <DetailItem
            label={translate('videoEditor.sidebar.actionPointLabel')}
            value={
              props.actionEvent.point
                ? `${Math.round(props.actionEvent.point.x)} × ${Math.round(props.actionEvent.point.y)}`
                : '—'
            }
          />
        </DetailList>
      </div>
    </>
  );
}
