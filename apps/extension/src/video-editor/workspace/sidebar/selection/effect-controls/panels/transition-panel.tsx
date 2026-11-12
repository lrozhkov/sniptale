import { useGlTransitionCatalog } from '../../../../../../composition/gl-transition-presets/catalog';
import {
  glTransitionChoices,
  glTransitionChoiceValue,
  resolveGlTransitionChoice,
} from '../../../../../../ui/gl-transition-choices';
import { GlTransitionPresetActions } from '../../../../../../composition/gl-transition-presets/actions';
import type { VideoProjectClip } from '../../../../../../features/video/project/types';

import { translate } from '../../../../../../platform/i18n';
import { SelectField } from '../../../../../../ui/compact-inspector-controls';
import { GlTransitionFields } from '../../../../../../ui/gl-transition-fields';
import type { WorkspaceSidebarSelectionPanelProps } from '../../../contracts/selection-panel';
import { InspectorGroupedPanel } from '../../grouped-inspector';
import { DetailItem, DetailList, PANEL_SECTION_CLASS_NAME } from '../../shared/panel';
import { OptionButtonsField } from '../../shared/option-buttons';
import { SliderField } from '../../shared/sliders';
import { getTransitionEasingOptions } from '../transition-options';
import { SelectionEmptyState } from '../../inspection/helpers';

type TransitionPanelProps = Pick<
  WorkspaceSidebarSelectionPanelProps,
  | 'project'
  | 'selectedTransition'
  | 'onUpdateTransitionDuration'
  | 'onUpdateTransitionEasing'
  | 'onUpdateTransitionTemplate'
>;

export function InspectTransitionPanel(props: TransitionPanelProps) {
  const glCatalog = useGlTransitionCatalog();
  const transition = props.selectedTransition;
  if (!transition) return <SelectionEmptyState />;
  const leading = props.project.clips.find((clip) => clip.id === transition.leadingClipId);
  const trailing = props.project.clips.find((clip) => clip.id === transition.trailingClipId);
  const disabled =
    !leading ||
    !trailing ||
    [leading, trailing].some(
      (clip) => props.project.tracks.find((track) => track.id === clip.trackId)?.locked !== false
    );
  const clipName = (clip: VideoProjectClip | undefined) => clip?.name ?? '';
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
              <div className="sniptale-parameter-stack space-y-3">
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
                {transition.kind === 'gl' ? (
                  <>
                    <SelectField
                      label={translate('videoEditor.sidebar.inspectorGroupTransition')}
                      disabled={disabled}
                      value={glTransitionChoiceValue(glCatalog, transition.selection)}
                      options={glTransitionChoices(glCatalog, transition.selection)}
                      onChange={(name) => {
                        const selection = resolveGlTransitionChoice(glCatalog, name);
                        if (!disabled && selection)
                          props.onUpdateTransitionTemplate(transition.id, {
                            selection,
                            presetId: null,
                          });
                      }}
                    />
                    <GlTransitionFields
                      presetActions={
                        <GlTransitionPresetActions
                          ownerKey={`${props.project.id}:${transition.id}`}
                          ownerRevision={props.project}
                          selection={transition.selection}
                          disabled={disabled}
                          onApply={(selection) => {
                            if (!disabled)
                              props.onUpdateTransitionTemplate(transition.id, {
                                selection,
                                presetId: null,
                              });
                          }}
                        />
                      }
                      selection={transition.selection}
                      easing={transition.easing}
                      disabled={disabled}
                      onChangeSelection={(selection) => {
                        if (!disabled)
                          props.onUpdateTransitionTemplate(transition.id, {
                            selection,
                            presetId: null,
                          });
                      }}
                      onChangeEasing={(easing) => {
                        if (!disabled) props.onUpdateTransitionEasing(transition.id, easing);
                      }}
                    />
                  </>
                ) : (
                  <OptionButtonsField
                    disabled={disabled}
                    label={translate('videoEditor.sidebar.transitionEasingLabel')}
                    value={transition.easing}
                    onChange={(value) => {
                      if (!disabled) props.onUpdateTransitionEasing(transition.id, value);
                    }}
                    options={getTransitionEasingOptions()}
                  />
                )}
              </div>
            ),
          },
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
