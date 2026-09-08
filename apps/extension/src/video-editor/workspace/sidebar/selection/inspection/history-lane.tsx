import { InspectorDetails } from '../shared/details';
import { useWorkspaceTrackPresentation } from '../../../surface/track-presentation';
import { translate } from '../../../../../platform/i18n';
import { getVideoProjectActionPresentation } from '../../../../../features/video/project/action-presentation';
import { getVideoProjectUtilityLanes } from '../../../../../features/video/project/utility-lanes';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { ActionPrimaryFields } from '../effect-controls/fields';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { ToggleField } from '../shared/controls';
import { SliderField } from '../shared/sliders';
import { PANEL_SECTION_CLASS_NAME } from '../shared/panel';

type HistoryProps = Pick<
  WorkspaceSidebarSelectionPanelProps,
  'project' | 'onUpdateActionPresentation'
> &
  Partial<Pick<WorkspaceSidebarSelectionPanelProps, 'onAddActionEvent'>>;

export function InspectHistoryLanePanel(props: HistoryProps) {
  const trackPresentation = useWorkspaceTrackPresentation();
  const presentation = getVideoProjectActionPresentation(props.project);
  const disabled =
    getVideoProjectUtilityLanes(props.project).actions.locked || !props.onUpdateActionPresentation;
  const update: NonNullable<HistoryProps['onUpdateActionPresentation']> = (patch) => {
    if (!disabled) props.onUpdateActionPresentation?.(patch);
  };
  return (
    <section className={PANEL_SECTION_CLASS_NAME} data-ui="video-editor.inspector.history-lane">
      <InspectorGroupedPanel
        groups={[
          {
            id: 'appearance',
            semantic: 'appearance' as const,
            label: translate('videoEditor.sidebar.inspectorGroupAppearance'),
            defaultActive: true,
            content: (
              <>
                <ToggleField
                  label={translate('videoEditor.sidebar.historyEnabled')}
                  checked={presentation.enabled}
                  disabled={disabled}
                  onChange={(enabled) => update({ enabled })}
                />
                <ActionPrimaryFields
                  part="appearance"
                  preset={presentation.clickPreset}
                  duration={presentation.duration}
                  offset={presentation.offset}
                  disabled={disabled}
                  onChange={({ preset, duration, offset }) =>
                    update({
                      ...(preset === undefined ? {} : { clickPreset: preset }),
                      ...(duration === undefined ? {} : { duration }),
                      ...(offset === undefined ? {} : { offset }),
                    })
                  }
                />
              </>
            ),
          },
          {
            id: 'animation',
            semantic: 'animation',
            label: translate('videoEditor.sidebar.inspectorGroupAnimation'),
            content: (
              <ActionPrimaryFields
                part="animation"
                preset={presentation.clickPreset}
                duration={presentation.duration}
                offset={presentation.offset}
                disabled={disabled}
                onChange={({ duration, offset }) =>
                  update({
                    ...(duration === undefined ? {} : { duration }),
                    ...(offset === undefined ? {} : { offset }),
                  })
                }
              />
            ),
          },
          {
            id: 'behavior',
            semantic: 'history' as const,
            label: translate('videoEditor.sidebar.inspectorGroupHistory'),
            content: (
              <>
                <SliderField
                  label={translate('videoEditor.sidebar.historySuppression')}
                  value={presentation.clickSuppressionInterval}
                  min={0}
                  max={5}
                  step={0.05}
                  disabled={disabled}
                  onChange={(clickSuppressionInterval) => update({ clickSuppressionInterval })}
                  formatValue={(value) => `${value.toFixed(2)} s`}
                />
                <ToggleField
                  label={translate('videoEditor.sidebar.historyShowKeys')}
                  checked={presentation.showKeystrokes}
                  disabled={disabled}
                  onChange={(showKeystrokes) => update({ showKeystrokes })}
                />
                {props.project.cursorTrack?.samples.length && trackPresentation ? (
                  <InspectorDetails label={translate('videoEditor.sidebar.inspectorDisplay')}>
                    <ToggleField
                      label={translate('videoEditor.timeline.cursorLane')}
                      checked={trackPresentation.panelPrefs.prefs.collapsedCursorLaneVisible}
                      onChange={trackPresentation.panelPrefs.setCollapsedCursorLaneVisible}
                    />
                  </InspectorDetails>
                ) : null}
              </>
            ),
          },
        ]}
      />
    </section>
  );
}
