import type { VideoProjectClip } from '../../../../../../features/video/project/types';
import { translate } from '../../../../../../platform/i18n';
import {
  getEffectClipLabel,
  getEffectInstanceLabel,
} from '../../../../../../features/video/project/effect-instance/presentation';
import { useWorkspacePreference } from '../../../../../runtime/controller/workspace-preferences';
import type { WorkspaceSidebarSelectionPanelProps } from '../../../contracts/selection-panel';
import { InspectorGroupedPanel } from '../../grouped-inspector';
import { DetailItem, DetailList, PANEL_SECTION_CLASS_NAME } from '../../shared/panel';
import { InspectorActionButton } from '../../shared/actions';
import { OptionButtonsField } from '../../shared/option-buttons';
import { SliderField } from '../../shared/sliders';
import { getTransitionEasingOptions } from '../transition-options';
import { SelectionEmptyState } from '../../inspection/helpers';
import { createEffectInstanceGroups } from '../../effect-instance/groups';

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

export function InspectTransitionPanel(props: TransitionPanelProps) {
  const [, setLibrary] = useWorkspacePreference('activeLibrary');
  const transition = props.selectedTransition;
  if (!transition) return <SelectionEmptyState />;
  const { leading, trailing, audio, disabled, instance } = resolveTransitionInspection(props);
  const timing = <TransitionTiming {...props} disabled={disabled} imported={Boolean(instance)} />;
  if (audio) return <section className={PANEL_SECTION_CLASS_NAME}>{timing}</section>;
  const clipName = (clip: VideoProjectClip | undefined) =>
    clip?.type === 'EFFECT' ? getEffectClipLabel(props.project, clip) : (clip?.name ?? '');
  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <InspectorGroupedPanel
        groups={[
          {
            id: 'general',
            semantic: 'transition',
            defaultActive: true,
            label: translate('videoEditor.sidebar.inspectorGroupTransition'),
            content: (
              <div className="space-y-3">
                <p className="break-words text-sm font-medium">
                  {instance
                    ? getEffectInstanceLabel(props.project, instance.id)
                    : translate('videoEditor.effectsLibrary.fallbackTransition')}
                </p>
                <div data-ui="video-editor.inspector.actions">
                  <InspectorActionButton
                    disabled={disabled}
                    onClick={() => setLibrary('transitions')}
                  >
                    {translate('videoEditor.effectsLibrary.chooseTransition')}
                  </InspectorActionButton>
                  {instance && (
                    <InspectorActionButton
                      disabled={disabled}
                      onClick={() => props.onDeleteEffectInstance?.(instance.id)}
                    >
                      {translate('videoEditor.effectsLibrary.useFallbackTransition')}
                    </InspectorActionButton>
                  )}
                </div>
                {timing}
              </div>
            ),
          },
          ...createEffectInstanceGroups({
            project: props.project,
            target: { kind: 'transition', transitionId: transition.id },
            disabled,
            onDeleteEffectInstance: props.onDeleteEffectInstance ?? (() => undefined),
            onDuplicateEffectInstance: props.onDuplicateEffectInstance ?? (() => null),
            onMoveEffectInstance: props.onMoveEffectInstance ?? (() => undefined),
            onUpdateEffectInstance: props.onUpdateEffectInstance ?? (() => undefined),
          }),
          {
            id: 'info',
            semantic: 'info',
            label: translate('videoEditor.sidebar.inspectorGroupInfo'),
            content: (
              <DetailList>
                <DetailItem
                  label={translate('videoEditor.sidebar.transitionLeadingClipLabel')}
                  value={clipName(leading)}
                />
                <DetailItem
                  label={translate('videoEditor.sidebar.transitionTrailingClipLabel')}
                  value={clipName(trailing)}
                />
              </DetailList>
            ),
          },
        ]}
      />
    </section>
  );
}

/** Junction timing is shared by audio and video; the imported graph owns its own easing. */
function TransitionTiming(props: TransitionPanelProps & { disabled: boolean; imported: boolean }) {
  const transition = props.selectedTransition;
  if (!transition) return null;
  const { disabled } = props;
  const leading = props.project.clips.find((clip) => clip.id === transition.leadingClipId);
  const trailing = props.project.clips.find((clip) => clip.id === transition.trailingClipId);
  return (
    <>
      <SliderField
        disabled={disabled}
        label={translate('videoEditor.sidebar.actionTimePrefix')}
        value={transition.duration}
        min={1 / props.project.fps}
        max={Math.max(
          1 / props.project.fps,
          Math.min(
            5,
            (leading?.duration ?? 1) - 1 / props.project.fps,
            (trailing?.duration ?? 1) - 1 / props.project.fps
          )
        )}
        step={1 / props.project.fps}
        onChange={(value) => {
          if (!disabled) props.onUpdateTransitionDuration(transition.id, value);
        }}
        formatValue={(value) => `${value.toFixed(2)} s`}
      />
      {!props.imported && (
        <OptionButtonsField
          label={translate('videoEditor.sidebar.transitionEasingLabel')}
          value={transition.easing}
          onChange={(value) => {
            if (!disabled) props.onUpdateTransitionEasing(transition.id, value);
          }}
          options={getTransitionEasingOptions()}
        />
      )}
    </>
  );
}

function resolveTransitionInspection(props: TransitionPanelProps) {
  const transition = props.selectedTransition!;
  const leading = props.project.clips.find((clip) => clip.id === transition.leadingClipId);
  const trailing = props.project.clips.find((clip) => clip.id === transition.trailingClipId);
  const audio = leading?.type === 'AUDIO';
  const disabled =
    !leading ||
    !trailing ||
    [leading, trailing].some(
      (clip) => props.project.tracks.find((track) => track.id === clip.trackId)?.locked !== false
    );
  const instance = props.project.effectInstances?.find(
    (item) => item.target.kind === 'transition' && item.target.transitionId === transition.id
  );
  return { leading, trailing, audio, disabled, instance };
}
