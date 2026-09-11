import { translate } from '../../../../platform/i18n';
import { ColorField, ToggleField } from '../selection/shared/controls';
import { SliderField } from '../selection/shared/sliders';
import type { SceneBackgroundFieldProps } from '../selection/scene-background/shared';
import type { WorkspaceSidebarGridSettings } from '../contracts/props';

export function GridSettingsPanel(props: {
  grid: WorkspaceSidebarGridSettings;
  recentColors: SceneBackgroundFieldProps['recentColors'];
  onRememberRecentColor: SceneBackgroundFieldProps['onRememberRecentColor'];
}) {
  return (
    <div className="space-y-3" data-ui="video-editor.scene.grid-settings">
      <div className="grid gap-3">
        <ToggleField
          checked={props.grid.enabled}
          label={translate('videoEditor.app.gridVisibleToggle')}
          onChange={props.grid.onSetEnabled}
        />
        {props.grid.enabled && (
          <>
            <ToggleField
              checked={props.grid.snapEnabled}
              label={translate('videoEditor.app.gridSnapToggle')}
              onChange={props.grid.onSetSnapEnabled}
            />
            <SliderField
              label={translate('videoEditor.app.gridSizeLabel')}
              value={props.grid.size}
              min={8}
              max={240}
              step={1}
              onChange={props.grid.onSetSize}
              formatValue={(value) => `${Math.round(value)} px`}
            />
            <ColorField
              label={translate('videoEditor.app.gridColorLabel')}
              value={props.grid.color}
              recentColors={props.recentColors}
              onRememberRecentColor={props.onRememberRecentColor}
              onChange={props.grid.onSetColor}
            />
          </>
        )}
      </div>
    </div>
  );
}
