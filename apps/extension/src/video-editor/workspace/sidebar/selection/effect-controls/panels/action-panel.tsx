import {
  getVideoProjectClickStyle,
  isCapturedVideoProjectGesture,
} from '../../../../../../features/video/project/action-feedback/projection';
import { getProjectGestureFeedbackDefaults } from '../../../../../../features/video/review/project-action-audio';
import { ActionFeedbackFields } from '../action-feedback-fields';
import { ActionClickStyleFields, ActionKeyStyleFields } from '../action-style-fields';
import { InspectorDetails } from '../../shared/details';
import { getActionEventLabel } from '../../../../../chrome/display';
import { canEditActionOccurrenceOnCanvas } from '../../../../../preview/stage/canvas/geometry';
import { InspectorActionButton } from '../../shared/actions';
import { translate } from '../../../../../../platform/i18n';
import { resolveVideoProjectActionPresentations } from '../../../../../../features/video/project/action-presentation';
import { getVideoProjectUtilityLanes } from '../../../../../../features/video/project/utility-lanes';
import type { VideoProjectActionPresentationOverride } from '../../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../../contracts/selection-panel';
import { ActionPointButtons, ActionPointFields, ActionPrimaryFields } from '../fields';
import { InspectorGroupedPanel, type InspectorGroupDefinition } from '../../grouped-inspector';
import { OptionButtonsField } from '../../shared/option-buttons';
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
  const source = event.anchor.kind === 'recording-source' ? event.anchor : null;
  const feedback = source
    ? props.project.actionFeedback?.find(
        (group) =>
          group.recordingId === source.recordingId &&
          group.sourceInstanceId === source.sourceInstanceId
      )
    : undefined;
  const gesture = Boolean(feedback && isCapturedVideoProjectGesture(event));
  const clickStyle = getVideoProjectClickStyle(props.project, event);
  const click = clickStyle !== null;
  const authoredGesture = feedback?.gestureStyles?.find(
    (style) => style.id === source?.sourceEventId
  );
  const gestureStyle =
    authoredGesture ?? clickStyle ?? getProjectGestureFeedbackDefaults(props.project);
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
            content: (
              <ActionOverview
                resolved={resolved}
                gesture={gesture}
                feedbackOverridden={Boolean(authoredGesture)}
              />
            ),
          },
          {
            id: 'appearance',
            semantic: event.kind === 'KEY' ? ('content' as const) : ('effects' as const),
            label: translate(
              event.kind === 'KEY'
                ? 'videoEditor.sidebar.historyKeyboard'
                : 'videoEditor.sidebar.historyClickEffects'
            ),
            defaultActive: true,
            content: (
              <ActionAppearanceFields
                props={props}
                resolved={resolved}
                disabled={disabled}
                update={update}
                gesture={gesture}
                click={click}
              />
            ),
          },
          ...actionVisualGroups({
            props,
            resolved,
            disabled,
            update,
            gesture,
            click,
            appearanceVisible: gestureStyle.effect !== 'off',
          }),
          ...(event.anchor.kind === 'recording-source' &&
          (event.kind === 'CLICK' || event.kind === 'KEY')
            ? [
                {
                  id: 'action-sound',
                  semantic: 'audio' as const,
                  label: translate('gallery.videoReview.actionAudio'),
                  content: (
                    <ActionFeedbackFields
                      project={props.project}
                      recordingId={event.anchor.recordingId}
                      sourceInstanceId={event.anchor.sourceInstanceId}
                      target={{
                        ref: { kind: 'action', id: event.anchor.sourceEventId },
                        family: event.kind === 'KEY' ? 'keyboard' : 'mouse',
                      }}
                      disabled={disabled}
                      part="sound"
                    />
                  ),
                },
              ]
            : []),
          ...(event.kind === 'KEY' || gesture || click
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

/** Captured gestures use source appearance. Ordinary actions retain authored animation controls. */
function actionVisualGroups({
  props,
  resolved,
  disabled,
  update,
  gesture,
  click,
  appearanceVisible,
}: {
  props: ActionProps;
  resolved: ActionPresentation;
  disabled: boolean;
  update(patch: VideoProjectActionPresentationOverride): void;
  gesture: boolean;
  click: boolean;
  appearanceVisible: boolean;
}): InspectorGroupDefinition<string>[] {
  const event = resolved.event;
  if (click && event.anchor.kind === 'recording-source') {
    if (!appearanceVisible) return [];
    const anchor = event.anchor;
    return [
      {
        id: 'click-style',
        semantic: 'appearance',
        label: translate('gallery.videoReview.clickAppearance'),
        content: (
          <ActionFeedbackFields
            project={props.project}
            recordingId={anchor.recordingId}
            sourceInstanceId={anchor.sourceInstanceId}
            target={{ ref: { kind: 'action', id: anchor.sourceEventId }, family: 'mouse' }}
            disabled={disabled}
            visual="click"
            part="visual"
            visualPart="appearance"
          />
        ),
      },
      {
        id: 'click-timing',
        semantic: 'animation',
        label: translate('gallery.videoReview.clickTiming'),
        content: (
          <ActionFeedbackFields
            project={props.project}
            recordingId={anchor.recordingId}
            sourceInstanceId={anchor.sourceInstanceId}
            target={{ ref: { kind: 'action', id: anchor.sourceEventId }, family: 'mouse' }}
            disabled={disabled}
            visual="click"
            part="visual"
            visualPart="timing"
          />
        ),
      },
      {
        id: 'placement',
        semantic: 'placement',
        label: translate('gallery.videoReview.clickPosition'),
        content: (
          <ActionPlacementFields
            props={props}
            resolved={resolved}
            disabled={disabled}
            update={update}
            sharedClick
          />
        ),
      },
    ];
  }
  if (gesture) {
    if (event.anchor.kind !== 'recording-source' || !appearanceVisible) return [];
    return [
      {
        id: 'gesture-style',
        semantic: 'appearance',
        label: translate('gallery.videoReview.clickAppearance'),
        content: (
          <ActionFeedbackFields
            project={props.project}
            recordingId={event.anchor.recordingId}
            sourceInstanceId={event.anchor.sourceInstanceId}
            target={{ ref: { kind: 'action', id: event.anchor.sourceEventId }, family: 'mouse' }}
            disabled={disabled}
            visual="gesture"
            part="visual"
            visualPart="appearance"
          />
        ),
      },
    ];
  }
  return [
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
  ];
}

function ActionPlacementFields({
  props,
  resolved,
  disabled,
  update,
  sharedClick = false,
}: {
  props: ActionProps;
  resolved: ActionPresentation;
  disabled: boolean;
  sharedClick?: boolean;
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
  const positionDisabled = disabled || (sharedClick && !event.point);
  const canPlace =
    !positionDisabled &&
    props.currentTime !== undefined &&
    canEditActionOccurrenceOnCanvas(props.project, occurrence, props.currentTime);
  return (
    <>
      <ActionPointButtons
        actionEventId={event.id}
        placementModeKind={props.placementMode?.kind ?? null}
        projectHeight={normalized ? 100 : props.project.height}
        projectWidth={normalized ? 100 : props.project.width}
        disabled={positionDisabled}
        onClearPlacementMode={props.onClearPlacementMode}
        onStartActionPointPlacement={() =>
          props.onStartActionPointPlacement(occurrence.eventId, occurrence.clipId)
        }
        canvasDisabled={!canPlace}
        onChange={updatePoint}
      />
      {sharedClick && event.anchor.kind === 'recording-source' ? (
        <ActionFeedbackFields
          project={props.project}
          recordingId={event.anchor.recordingId}
          sourceInstanceId={event.anchor.sourceInstanceId}
          target={{ ref: { kind: 'action', id: event.anchor.sourceEventId }, family: 'mouse' }}
          disabled={positionDisabled}
          visual="click"
          part="visual"
          visualPart="position"
        />
      ) : (
        <InspectorDetails
          preferenceId="action-panel:videoEditor.sidebar.inspectorExactPlacement"
          label={translate('videoEditor.sidebar.inspectorExactPlacement')}
        >
          <ActionPointFields
            point={normalized ? { x: point.x * 100, y: point.y * 100 } : point}
            projectHeight={normalized ? 100 : props.project.height}
            projectWidth={normalized ? 100 : props.project.width}
            disabled={positionDisabled}
            onChange={updatePoint}
          />
        </InspectorDetails>
      )}
    </>
  );
}

function ActionOverview({
  resolved,
  gesture,
  feedbackOverridden,
}: {
  resolved: ActionPresentation;
  gesture: boolean;
  feedbackOverridden: boolean;
}) {
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
      {!gesture ? (
        <DetailItem
          label={translate('videoEditor.sidebar.inspectorGroupStatus')}
          value={resolveStatusLabel(resolved.reason)}
        />
      ) : null}
      <DetailItem
        label={translate('videoEditor.sidebar.historySettings')}
        value={translate(
          resolved.overridden || feedbackOverridden
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

function ActionAppearanceFields({
  props,
  resolved,
  disabled,
  update,
  gesture,
  click,
}: {
  props: ActionProps;
  resolved: ActionPresentation;
  disabled: boolean;
  gesture: boolean;
  click: boolean;
  update(patch: VideoProjectActionPresentationOverride): void;
}) {
  const { event, occurrence } = resolved;
  return (
    <>
      <OptionButtonsField
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
            presentation: mode === 'inherit' ? overrides : { ...overrides, enabled: mode === 'on' },
          });
        }}
      />
      {resolved.reason &&
      (!(gesture || click) ||
        resolved.reason === 'track-disabled' ||
        resolved.reason === 'event-disabled') ? (
        <p className="mt-2 text-xs text-[var(--sniptale-color-text-muted)]" role="status">
          {resolveStatusLabel(resolved.reason)}
        </p>
      ) : null}
      {(gesture || click) && event.anchor.kind === 'recording-source' ? (
        <ActionFeedbackFields
          project={props.project}
          recordingId={event.anchor.recordingId}
          sourceInstanceId={event.anchor.sourceInstanceId}
          target={{ ref: { kind: 'action', id: event.anchor.sourceEventId }, family: 'mouse' }}
          disabled={disabled}
          visual={gesture ? 'gesture' : 'click'}
          part="visual"
          visualPart="animation"
        />
      ) : (
        <>
          <ActionPrimaryFields
            part="appearance"
            duration={resolved.duration}
            offset={resolved.offset}
            preset={resolved.preset}
            showPreset={event.kind !== 'KEY' && event.kind !== 'SCROLL'}
            disabled={disabled}
            onChange={update}
          />
          <EventStyleFields props={props} resolved={resolved} disabled={disabled} update={update} />
        </>
      )}
      {!gesture && !click ? (
        <InspectorActionButton
          compact
          tone="secondary"
          separated
          disabled={disabled || !resolved.overridden}
          onClick={() =>
            props.onUpdateActionEventDetails(event.id, {
              clipId: occurrence.clipId,
              presentation: null,
            })
          }
        >
          {translate('videoEditor.sidebar.historyReset')}
        </InspectorActionButton>
      ) : null}
    </>
  );
}
