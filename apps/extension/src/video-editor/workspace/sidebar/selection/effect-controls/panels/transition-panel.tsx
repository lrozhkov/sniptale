import { InspectorDetails } from '../../shared/details';
import { translate } from '../../../../../../platform/i18n';
import { getVideoTransitionTemplateDefinition } from '../../../../../../features/video/project/transition/template';
import { resolveClipLogicalLaneId } from '../../../../../../features/video/project/timeline';
import { resolveTransitionTemplateControls } from '../../../../../../features/video/project/transition/template-controls';
import type { WorkspaceSidebarSelectionPanelProps } from '../../../contracts/selection-panel';
import { ColorField, SelectInput } from '../../shared/controls';
import { InspectorGroupedPanel } from '../../grouped-inspector';
import { DetailItem, DetailList, PANEL_SECTION_CLASS_NAME } from '../../shared/panel';
import { OptionButtonsField } from '../../shared/option-buttons';
import { SliderField } from '../../shared/sliders';
import {
  getTransitionDirectionOptions,
  getTransitionEasingOptions,
  getTransitionIntensityOptions,
  getTransitionTemplateOptions,
} from '../transition-options';
import { SelectionEmptyState } from '../../inspection/helpers';
import { TransitionTemplateActions } from './transition-template-actions';
import { createEffectInstanceGroup } from '../../effect-instance/groups';

type TransitionPanelProps = Pick<
  WorkspaceSidebarSelectionPanelProps,
  | 'project'
  | 'selectedTransition'
  | 'recentColors'
  | 'onRememberRecentColor'
  | 'onUpdateTransitionDuration'
  | 'onUpdateTransitionEasing'
  | 'onUpdateTransitionTemplate'
  | 'onDeleteEffectInstance'
  | 'onDuplicateEffectInstance'
  | 'onMoveEffectInstance'
  | 'onUpdateEffectInstance'
>;

type SelectedTransition = NonNullable<WorkspaceSidebarSelectionPanelProps['selectedTransition']>;

export function InspectTransitionPanel(props: TransitionPanelProps) {
  const transition = props.selectedTransition;
  if (!transition) {
    return <SelectionEmptyState />;
  }

  return <TransitionInspectorContent props={props} transition={transition} />;
}

function TransitionInspectorContent(props: {
  props: TransitionPanelProps;
  transition: SelectedTransition;
}) {
  const audioTransition = props.props.project.clips.some(
    (clip) => clip.id === props.transition.leadingClipId && clip.type === 'AUDIO'
  );
  if (audioTransition)
    return (
      <section className={PANEL_SECTION_CLASS_NAME}>
        <TransitionMotionFields props={props.props} transition={props.transition} audioOnly />
      </section>
    );
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
    props: TransitionPanelProps;
    transition: SelectedTransition;
  },
  controls: ReturnType<typeof resolveTransitionTemplateControls>
) {
  return [
    {
      id: 'general',
      semantic: 'transition',
      defaultActive: true,
      label: translate('videoEditor.sidebar.inspectorGroupTransition'),
      content: (
        <>
          <TransitionTemplateField props={props.props} transition={props.transition} />
          {controls.showStyleGroup ? (
            <TransitionStyleFields props={props.props} transition={props.transition} />
          ) : null}
        </>
      ),
    },
    {
      id: 'motion',
      semantic: 'animation',
      label: translate('videoEditor.sidebar.inspectorGroupAnimation'),
      content: <TransitionMotionFields props={props.props} transition={props.transition} />,
    },
    createTransitionStackGroup(props),
    {
      id: 'info',
      semantic: 'info',
      label: translate('videoEditor.sidebar.inspectorGroupInfo'),
      content: <TransitionBoundaryStatus props={props.props} transition={props.transition} />,
    },
  ] as const;
}

function createTransitionStackGroup(props: {
  props: TransitionPanelProps;
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
    semantic: 'effects' as const,
    label: translate('videoEditor.sidebar.inspectorGroupEffects'),
  };
}

function TransitionBoundaryStatus(props: {
  props: TransitionPanelProps;
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

function TransitionTemplateField(props: {
  props: TransitionPanelProps;
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
        options={getTransitionTemplateOptions().map(({ value, label }) => ({ value, label }))}
      />
      <InspectorDetails label={translate('videoEditor.sidebar.inspectorMoreDetails')}>
        <TransitionTemplateActions
          transition={props.transition}
          onUpdateTransitionDuration={props.props.onUpdateTransitionDuration}
          onUpdateTransitionTemplate={props.props.onUpdateTransitionTemplate}
        />
      </InspectorDetails>
    </div>
  );
}

function TransitionMotionFields(props: {
  audioOnly?: boolean;
  props: TransitionPanelProps;
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
      {!props.audioOnly && controls.supportsDirection ? (
        <SelectInput
          label={translate('videoEditor.sidebar.transitionDirectionLabel')}
          value={props.transition.direction ?? definition.defaultDirection}
          onChange={(value) =>
            props.props.onUpdateTransitionTemplate(props.transition.id, { direction: value })
          }
          options={getTransitionDirectionOptions()}
        />
      ) : null}
      {!props.audioOnly && controls.supportsIntensity ? (
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
  props: TransitionPanelProps;
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
