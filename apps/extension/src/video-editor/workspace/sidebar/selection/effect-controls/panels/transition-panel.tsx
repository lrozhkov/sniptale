import { translate } from '../../../../../../platform/i18n';
import { getVideoTemplateCatalogStatusLabelKey } from '../../../../../../features/video/project/template/catalog-status';
import { getVideoTransitionTemplateDefinition } from '../../../../../../features/video/project/transition/template';
import { resolveClipLogicalLaneId } from '../../../../../../features/video/project/timeline';
import { resolveTransitionTemplateControls } from '../../../../../../features/video/project/transition/template-controls';
import { TemplatePreviewBadges } from '../../../../../library/template-preview';
import type { WorkspaceSidebarSelectionPanelProps } from '../../../contracts/selection-panel';
import { ColorField, SelectInput } from '../../shared/controls';
import { InspectorGroupedPanel } from '../../grouped-inspector';
import {
  DetailItem,
  DetailList,
  PANEL_HEADING_CLASS_NAME,
  PANEL_META_CLASS_NAME,
  PANEL_SECTION_CLASS_NAME,
} from '../../shared/panel';
import { OptionButtonsField } from '../../shared/option-buttons';
import { SliderField } from '../../shared/sliders';
import {
  getTransitionDirectionOptions,
  getTransitionEasingOptions,
  getTransitionIntensityOptions,
  getTransitionLabel,
  getTransitionTemplateOptions,
} from '../transition-options';
import { SelectionEmptyState } from '../../inspection/helpers';
import { TransitionTemplateActions } from './transition-template-actions';
import { createEffectInstanceGroup } from '../../effect-instance/groups';

type SelectedTransition = NonNullable<WorkspaceSidebarSelectionPanelProps['selectedTransition']>;

export function InspectTransitionPanel(props: WorkspaceSidebarSelectionPanelProps) {
  const transition = props.selectedTransition;
  if (!transition) {
    return <SelectionEmptyState />;
  }

  return <TransitionInspectorContent props={props} transition={transition} />;
}

function TransitionInspectorContent(props: {
  props: WorkspaceSidebarSelectionPanelProps;
  transition: SelectedTransition;
}) {
  const definition = getVideoTransitionTemplateDefinition(
    props.transition.templateKind ?? props.transition.kind
  );
  const controls = resolveTransitionTemplateControls(definition);

  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <InspectorGroupedPanel groups={createTransitionGroups(props, controls)} />
    </section>
  );
}

function createTransitionGroups(
  props: {
    props: WorkspaceSidebarSelectionPanelProps;
    transition: SelectedTransition;
  },
  controls: ReturnType<typeof resolveTransitionTemplateControls>
) {
  return [
    {
      id: 'info',
      label: translate('videoEditor.sidebar.inspectorGroupSummary'),
      defaultActive: true,
      content: <TransitionOverview transition={props.transition} />,
    },
    {
      id: 'general',
      label: translate('videoEditor.sidebar.inspectorGroupTemplate'),
      content: <TransitionTemplateField props={props.props} transition={props.transition} />,
      visible: controls.showTemplateField,
    },
    {
      id: 'motion',
      label: translate('videoEditor.sidebar.inspectorGroupTiming'),
      content: <TransitionMotionFields props={props.props} transition={props.transition} />,
      visible: controls.showMotionGroup,
    },
    {
      id: 'status',
      label: translate('videoEditor.sidebar.inspectorGroupStatus'),
      content: <TransitionBoundaryStatus props={props.props} transition={props.transition} />,
    },
    createTransitionStackGroup(props),
    {
      id: 'style',
      label: translate('videoEditor.sidebar.inspectorGroupStyle'),
      content: <TransitionStyleFields props={props.props} transition={props.transition} />,
      visible: controls.showStyleGroup,
    },
  ] as const;
}

function createTransitionStackGroup(props: {
  props: WorkspaceSidebarSelectionPanelProps;
  transition: SelectedTransition;
}) {
  return {
    ...createEffectInstanceGroup({
      onDeleteEffectInstance: props.props.onDeleteEffectInstance ?? (() => undefined),
      onDuplicateEffectInstance: props.props.onDuplicateEffectInstance ?? (() => null),
      onMoveEffectInstance: props.props.onMoveEffectInstance ?? (() => undefined),
      onUpdateEffectInstance: props.props.onUpdateEffectInstance ?? (() => undefined),
      project: props.props.project,
      target: { kind: 'transition', transitionId: props.transition.id },
    }),
    id: 'transition-stack',
    label: translate('videoEditor.sidebar.inspectorGroupTemplateStack'),
  };
}

function TransitionBoundaryStatus(props: {
  props: WorkspaceSidebarSelectionPanelProps;
  transition: SelectedTransition;
}) {
  const leadingClip = props.props.project.clips.find(
    (clip) => clip.id === props.transition.leadingClipId
  );
  const trailingClip = props.props.project.clips.find(
    (clip) => clip.id === props.transition.trailingClipId
  );
  const sameTrack = Boolean(
    leadingClip && trailingClip && leadingClip.trackId === trailingClip.trackId
  );
  const sameLane = Boolean(
    leadingClip &&
    trailingClip &&
    resolveClipLogicalLaneId(leadingClip) === resolveClipLogicalLaneId(trailingClip)
  );
  const boundaryReady = sameTrack && sameLane;

  return (
    <DetailList>
      <DetailItem
        label={translate('videoEditor.sidebar.transitionLeadingClipLabel')}
        value={leadingClip?.name ?? props.transition.leadingClipId}
      />
      <DetailItem
        label={translate('videoEditor.sidebar.transitionTrailingClipLabel')}
        value={trailingClip?.name ?? props.transition.trailingClipId}
      />
      <DetailItem
        label={translate('videoEditor.sidebar.transitionTrackStatusLabel')}
        value={
          sameTrack
            ? translate('videoEditor.sidebar.transitionBoundaryReady')
            : translate('videoEditor.sidebar.transitionBoundaryMismatch')
        }
      />
      <DetailItem
        label={translate('videoEditor.sidebar.transitionLaneStatusLabel')}
        value={
          boundaryReady
            ? translate('videoEditor.sidebar.transitionBoundaryReady')
            : translate('videoEditor.sidebar.transitionBoundaryMismatch')
        }
      />
    </DetailList>
  );
}

function TransitionOverview(props: { transition: SelectedTransition }) {
  const definition = getVideoTransitionTemplateDefinition(
    props.transition.templateKind ?? props.transition.kind
  );

  return (
    <>
      <p className={PANEL_HEADING_CLASS_NAME}>{getTransitionLabel(props.transition)}</p>
      <p className={`mt-1 ${PANEL_META_CLASS_NAME}`}>{translate(definition.groupLabelKey)}</p>
      <p
        className={[
          'mt-2 text-[11px] font-medium uppercase tracking-[0.12em]',
          'text-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        {translate(definition.useCaseKey)}
      </p>
      <TemplatePreviewBadges preview={definition.preview} />
      <p className="mt-2 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
        {translate(definition.descriptionKey)}
      </p>
      <p className={`mt-2 ${PANEL_META_CLASS_NAME}`}>
        {translate(getVideoTemplateCatalogStatusLabelKey(definition.catalogStatus))} ·{' '}
        {`${definition.defaultDurationSeconds.toFixed(2)}s`}
      </p>
    </>
  );
}

function TransitionTemplateField(props: {
  props: WorkspaceSidebarSelectionPanelProps;
  transition: SelectedTransition;
}) {
  const templateKind = props.transition.templateKind ?? props.transition.kind;

  return (
    <div className="space-y-2">
      <SelectInput
        label={translate('videoEditor.sidebar.actionPresetLabel')}
        value={templateKind}
        onChange={(value) =>
          props.props.onUpdateTransitionTemplate(props.transition.id, { templateKind: value })
        }
        options={getTransitionTemplateOptions()}
      />
      <TransitionTemplateActions
        transition={props.transition}
        onUpdateTransitionDuration={props.props.onUpdateTransitionDuration}
        onUpdateTransitionTemplate={props.props.onUpdateTransitionTemplate}
      />
    </div>
  );
}

function TransitionMotionFields(props: {
  props: WorkspaceSidebarSelectionPanelProps;
  transition: SelectedTransition;
}) {
  const definition = getVideoTransitionTemplateDefinition(
    props.transition.templateKind ?? props.transition.kind
  );
  const controls = resolveTransitionTemplateControls(definition);

  return (
    <>
      <SliderField
        label={translate('videoEditor.sidebar.actionTimePrefix')}
        value={props.transition.duration}
        min={0.1}
        max={5}
        step={0.05}
        onChange={(value) => props.props.onUpdateTransitionDuration(props.transition.id, value)}
        formatValue={(value) => `${value.toFixed(2)} s`}
      />
      <OptionButtonsField
        label={translate('videoEditor.sidebar.transitionEasingLabel')}
        value={props.transition.easing}
        onChange={(value) => props.props.onUpdateTransitionEasing(props.transition.id, value)}
        options={getTransitionEasingOptions()}
      />
      {controls.supportsDirection ? (
        <SelectInput
          label={translate('videoEditor.sidebar.transitionDirectionLabel')}
          value={props.transition.direction ?? definition.defaultDirection}
          onChange={(value) =>
            props.props.onUpdateTransitionTemplate(props.transition.id, { direction: value })
          }
          options={getTransitionDirectionOptions()}
        />
      ) : null}
      {controls.supportsIntensity ? (
        <OptionButtonsField
          label={translate('videoEditor.sidebar.transitionIntensityLabel')}
          value={props.transition.intensity ?? definition.defaultIntensity}
          onChange={(value) =>
            props.props.onUpdateTransitionTemplate(props.transition.id, { intensity: value })
          }
          options={getTransitionIntensityOptions()}
        />
      ) : null}
    </>
  );
}

function TransitionStyleFields(props: {
  props: WorkspaceSidebarSelectionPanelProps;
  transition: SelectedTransition;
}) {
  const definition = getVideoTransitionTemplateDefinition(
    props.transition.templateKind ?? props.transition.kind
  );
  const controls = resolveTransitionTemplateControls(definition);

  return (
    <>
      {controls.supportsHighlightColor ? (
        <ColorField
          label={translate('videoEditor.sidebar.transitionHighlightColorLabel')}
          recentColors={props.props.recentColors}
          onRememberRecentColor={props.props.onRememberRecentColor}
          value={props.transition.highlightColor ?? definition.defaultHighlightColor}
          onChange={(value) =>
            props.props.onUpdateTransitionTemplate(props.transition.id, {
              highlightColor: value,
            })
          }
        />
      ) : null}
    </>
  );
}
