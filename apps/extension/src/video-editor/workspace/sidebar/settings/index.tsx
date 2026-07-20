import { translate } from '../../../../platform/i18n';
import type { TranslationKey } from '../../../../platform/i18n';
import type React from 'react';
import { ColorField, ToggleField } from '../selection/shared/controls';
import { PANEL_META_CLASS_NAME } from '../selection/shared/panel';
import { SliderField } from '../selection/shared/sliders';
import type { SceneBackgroundFieldProps } from '../selection/scene-background/shared';
import type { WorkspaceSidebarGridSettings } from '../contracts/props';

function SettingsPanelFrame(props: { children: React.ReactNode; descriptionKey: TranslationKey }) {
  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3">
      <div className="space-y-4">
        <p className={PANEL_META_CLASS_NAME}>{translate(props.descriptionKey)}</p>
        {props.children}
      </div>
    </div>
  );
}

export function GridSettingsPanel(props: {
  grid: WorkspaceSidebarGridSettings;
  recentColors: SceneBackgroundFieldProps['recentColors'];
  onRememberRecentColor: SceneBackgroundFieldProps['onRememberRecentColor'];
}) {
  return (
    <SettingsPanelFrame descriptionKey="videoEditor.sidebar.gridSettingsDescription">
      <div className="grid gap-3">
        <ToggleField
          checked={props.grid.enabled}
          label={translate('videoEditor.app.gridVisibleToggle')}
          onChange={props.grid.onSetEnabled}
        />
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
      </div>
    </SettingsPanelFrame>
  );
}
