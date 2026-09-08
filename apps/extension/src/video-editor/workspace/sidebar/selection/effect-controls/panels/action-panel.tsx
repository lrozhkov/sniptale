import { ActionClickStyleFields, ActionKeyStyleFields } from '../action-style-fields';
import { InspectorDetails } from '../../shared/details';
import { getActionEventLabel } from '../../../../../chrome/display';
import { canEditActionOccurrenceOnCanvas } from '../../../../../preview/stage/canvas/geometry';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../../../../platform/i18n';
import { resolveVideoProjectActionPresentations } from '../../../../../../features/video/project/action-presentation';
import { getVideoProjectUtilityLanes } from '../../../../../../features/video/project/utility-lanes';
import type { VideoProjectActionPresentationOverride } from '../../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../../contracts/selection-panel';
import { ActionPointButtons, ActionPointFields, ActionPrimaryFields } from '../fields';
import { InspectorGroupedPanel } from '../../grouped-inspector';
import { SelectInput } from '../../shared/controls';
import { SelectionEmptyState } from '../../inspection/helpers';
import { DetailItem, DetailList, PANEL_SECTION_CLASS_NAME } from '../../shared/panel';

type ActionPresentation = ReturnType<typeof resolveVideoProjectActionPresentations>[number];
type ActionProps = Pick<
  WorkspaceSidebarSelectionPanelProps,
  | 'project'
  | 'currentTime'
  | 'selectedActionOccurrence'
  | 'onUpdateActionEventDetails'
  | 'placementMode'
  | 'onClearPlacementMode'
  | 'onStartActionPointPlacement'
> &
  Partial<Pick<WorkspaceSidebarSelectionPanelProps, 'recentColors' | 'onRememberRecentColor'>>;

export function InspectActionPanel(props: ActionProps) {
  const occurrence = props.selectedActionOccurrence;
  if (!occurrence) return <SelectionEmptyState />;
  const event = occurrence.event;
  const presentations = resolveVideoProjectActionPresentations(props.project);
  const resolved = presentations.find(
    (row) =>
      row.occurrence.eventId === occurrence.eventId && row.occurrence.clipId === occurrence.clipId
  );
  if (!resolved) return <SelectionEmptyState />;
  const disabled = getVideoProjectUtilityLanes(props.project).actions.locked;
  const update = (patch: VideoProjectActionPresentationOverride) => {
    if (!disabled)
      props.onUpdateActionEventDetails(event.id, {
        clipId: occurrence.clipId,
        presentation: { ...event.presentation, ...patch },
      });
  };
  return (
    <section className={PANEL_SECTION_CLASS_NAME} data-ui="video-editor.inspector.history-event">
      {presentations.filter((row) => row.occurrence.eventId === occurrence.eventId).length > 1 ? (
        <p className="mb-2 text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.sidebar.actionSharedOccurrencesHint')}
        </p>
      ) : null}
      <InspectorGroupedPanel
        groups={[
          {
            id: 'info',
            semantic: 'info' as const,
            label: translate('videoEditor.sidebar.inspectorGroupInfo'),
            content: <ActionOverview resolved={resolved} />,
          },
          {
            id: 'appearance',
            semantic: 'appearance' as const,
            label: translate(
              event.kind === 'KEY'
                ? 'videoEditor.sidebar.historyKeyboard'
                : 'videoEditor.sidebar.historyClickEffects'
            ),
            defaultActive: true,
            content: (
              <>
                <SelectInput
                  label={translate('videoEditor.sidebar.historyEventMode')}
                  value={
                    event.presentation?.enabled === undefined
                      ? 'inherit'
                      : event.presentation.enabled
                        ? 'on'
                        : 'off'
                  }
                  disabled={disabled}
                  options={[
                    { value: 'inherit', label: translate('videoEditor.sidebar.historyInherit') },
                    { value: 'on', label: translate('videoEditor.sidebar.historyForceOn') },
                    { value: 'off', label: translate('videoEditor.sidebar.historyForceOff') },
                  ]}
                  onChange={(mode) => {
                    if (disabled) return;
                    const { enabled: _enabled, ...overrides } = event.presentation ?? {};
                    props.onUpdateActionEventDetails(event.id, {
                      clipId: occurrence.clipId,
                      presentation:
                        mode === 'inherit' ? overrides : { ...overrides, enabled: mode === 'on' },
                    });
                  }}
                />
                {resolved.reason ? (
                  <p className="mt-2 text-xs text-[var(--sniptale-color-text-muted)]" role="status">
                    {resolveStatusLabel(resolved.reason)}
                  </p>
                ) : null}
                <ActionPrimaryFields
                  part="appearance"
                  duration={resolved.duration}
                  offset={resolved.offset}
                  preset={resolved.preset}
                  showPreset={event.kind !== 'KEY' && event.kind !== 'SCROLL'}
                  disabled={disabled}
                  onChange={update}
                />
                <EventStyleFields
                  props={props}
                  resolved={resolved}
                  disabled={disabled}
                  update={update}
                />
                <ProductActionButton
                  compact
                  tone="secondary"
                  className="mt-3"
                  disabled={disabled || !resolved.overridden}
                  onClick={() =>
                    props.onUpdateActionEventDetails(event.id, {
                      clipId: occurrence.clipId,
                      presentation: null,
                    })
                  }
                >
                  {translate('videoEditor.sidebar.historyReset')}
                </ProductActionButton>
              </>
            ),
          },
          {
            id: 'animation',
            semantic: 'animation',
            label: translate('videoEditor.sidebar.historyTransitions'),
            content: (
              <ActionPrimaryFields
                part="animation"
                easing={resolved.easing}
                showEasing={event.kind !== 'KEY'}
                duration={resolved.duration}
                offset={resolved.offset}
                preset={resolved.preset}
                disabled={disabled}
                onChange={update}
              />
            ),
          },
          ...(event.kind === 'KEY'
            ? []
            : [
                {
                  id: 'placement',
                  semantic: 'placement' as const,
                  label: translate('videoEditor.sidebar.inspectorGroupPlacement'),
                  content: (
                    <ActionPlacementFields
                      props={props}
                      resolved={resolved}
                      disabled={disabled}
                      update={update}
                    />
                  ),
                },
              ]),
        ]}
      />
    </section>
  );
}

function ActionPlacementFields({
  props,
  resolved,
  disabled,
  update,
}: {
  props: ActionProps;
  resolved: ActionPresentation;
  disabled: boolean;
  update: (patch: VideoProjectActionPresentationOverride) => void;
}) {
  const occurrence = resolved.occurrence;
  const event = resolved.event;
  const normalized = event.anchor.kind === 'recording-source';
  const point = resolved.point ?? {
    x: normalized ? 0.5 : props.project.width / 2,
    y: normalized ? 0.5 : props.project.height / 2,
  };
  const updatePoint = (patch: VideoProjectActionPresentationOverride) =>
    update({
      ...patch,
      ...(normalized && patch.point
        ? { point: { x: patch.point.x / 100, y: patch.point.y / 100 } }
        : {}),
    });
  const canPlace =
    props.currentTime !== undefined &&
    canEditActionOccurrenceOnCanvas(props.project, occurrence, props.currentTime);
  return (
    <>
      <ActionPointButtons
        actionEventId={event.id}
        placementModeKind={props.placementMode?.kind ?? null}
        projectHeight={normalized ? 100 : props.project.height}
        projectWidth={normalized ? 100 : props.project.width}
        disabled={disabled}
        onClearPlacementMode={props.onClearPlacementMode}
        onStartActionPointPlacement={() =>
          props.onStartActionPointPlacement(occurrence.eventId, occurrence.clipId)
        }
        canvasDisabled={!canPlace}
        onChange={updatePoint}
      />
      <InspectorDetails label={translate('videoEditor.sidebar.inspectorExactPlacement')}>
        <ActionPointFields
          point={normalized ? { x: point.x * 100, y: point.y * 100 } : point}
          projectHeight={normalized ? 100 : props.project.height}
          projectWidth={normalized ? 100 : props.project.width}
          disabled={disabled}
          onChange={updatePoint}
        />
      </InspectorDetails>
    </>
  );
}

function ActionOverview({ resolved }: { resolved: ActionPresentation }) {
  const event = resolved.event;
  return (
    <DetailList>
      <DetailItem
        label={translate('videoEditor.sidebar.historyEventLabel')}
        value={getActionEventLabel(event)}
      />
      <DetailItem
        label={translate('videoEditor.sidebar.historyEventKind')}
        value={getActionEventLabel({ kind: event.kind, label: '', data: {} })}
      />
      <DetailItem
        label={translate('videoEditor.sidebar.actionTimePrefix')}
        value={`${resolved.occurrence.time.toFixed(2)} s`}
      />
      <DetailItem
        label={translate('videoEditor.sidebar.actionPointLabel')}
        value={
          event.point
            ? event.anchor.kind === 'recording-source'
              ? `${(event.point.x * 100).toFixed(1)}% × ${(event.point.y * 100).toFixed(1)}%`
              : `${Math.round(event.point.x)} × ${Math.round(event.point.y)}`
            : '—'
        }
      />
      <DetailItem
        label={translate('videoEditor.sidebar.inspectorGroupStatus')}
        value={resolveStatusLabel(resolved.reason)}
      />
      <DetailItem
        label={translate('videoEditor.sidebar.historySettings')}
        value={translate(
          resolved.overridden
            ? 'videoEditor.sidebar.historyOverridden'
            : 'videoEditor.sidebar.historyInherit'
        )}
      />
    </DetailList>
  );
}

function resolveStatusLabel(reason: ActionPresentation['reason']) {
  switch (reason) {
    case 'track-disabled':
      return translate('videoEditor.sidebar.historyTrackDisabled');
    case 'event-disabled':
      return translate('videoEditor.sidebar.historyForceOff');
    case 'suppressed':
      return translate('videoEditor.sidebar.historySuppressed');
    case 'preset-none':
      return translate('videoEditor.sidebar.actionPresetNone');
    case 'keystrokes-disabled':
      return translate('videoEditor.sidebar.historyKeysDisabled');
    case 'unsupported':
      return translate('videoEditor.sidebar.historyUnsupported');
    case 'outside-source':
      return translate('videoEditor.sidebar.historyOutsideSource');
    case null:
      return translate('videoEditor.sidebar.historyVisible');
  }
}

function EventStyleFields({
  props,
  resolved,
  disabled,
  update,
}: {
  props: ActionProps;
  resolved: ActionPresentation;
  disabled: boolean;
  update: (patch: VideoProjectActionPresentationOverride) => void;
}) {
  const common = {
    disabled,
    recentColors: props.recentColors,
    onRememberRecentColor: props.onRememberRecentColor,
  };
  if (resolved.event.kind === 'KEY')
    return (
      <ActionKeyStyleFields
        {...common}
        value={resolved.keyStyle}
        onChange={(keyStyle) => update({ keyStyle })}
      />
    );
  if (resolved.event.kind === 'SCROLL' || resolved.preset === 'NONE') return null;
  return (
    <ActionClickStyleFields
      {...common}
      value={resolved.clickStyle}
      onChange={(clickStyle) => update({ clickStyle })}
    />
  );
}
