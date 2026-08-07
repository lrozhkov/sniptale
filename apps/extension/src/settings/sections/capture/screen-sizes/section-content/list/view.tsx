import { translate } from '../../../../../../platform/i18n';
import type { ViewportPreset, ViewportPresetTarget } from '../../../../../../contracts/settings';
import { settingsMetaLabelClassName } from '../../../../../section-surface';
import { PresetRow } from './preset-row';
import { AddViewportPresetButton } from '../add-button';

function PresetGroup(props: {
  hoveredViewportId: string | null;
  isLoading: boolean;
  onDelete: (preset: ViewportPreset) => void;
  onEdit: (preset: ViewportPreset) => void;
  onHoverChange: (id: string | null) => void;
  onMove: (presetId: string, direction: -1 | 1) => Promise<void>;
  onReset: (preset: ViewportPreset) => Promise<void>;
  onToggle: (preset: ViewportPreset) => Promise<void>;
  presets: ViewportPreset[];
  target: ViewportPresetTarget;
}) {
  if (props.presets.length === 0) return null;
  return (
    <div className="space-y-2">
      <div>
        <div className={settingsMetaLabelClassName}>
          {translate(`viewportPresets.groups.${props.target}`)}
        </div>
        <p className="mt-1 text-xs text-[var(--sniptale-color-text-dim)]">
          {translate(`viewportPresets.hints.${props.target}`)}
        </p>
      </div>
      <div className="overflow-hidden rounded-[12px] border border-[var(--sniptale-color-border-soft)]">
        {props.presets.map((preset, index) => (
          <PresetRow
            key={preset.id}
            preset={preset}
            canMoveUp={index > 0}
            canMoveDown={index < props.presets.length - 1}
            hoveredViewportId={props.hoveredViewportId}
            isLoading={props.isLoading}
            onDelete={props.onDelete}
            onEdit={props.onEdit}
            onHoverChange={props.onHoverChange}
            onMove={props.onMove}
            onReset={props.onReset}
            onToggle={props.onToggle}
          />
        ))}
      </div>
    </div>
  );
}

export function PresetsList(props: {
  hoveredViewportId: string | null;
  isLoading: boolean;
  onDelete: (preset: ViewportPreset) => void;
  onEdit: (preset: ViewportPreset) => void;
  onHoverChange: (id: string | null) => void;
  onMove: (presetId: string, direction: -1 | 1) => Promise<void>;
  onReset: (preset: ViewportPreset) => Promise<void>;
  onToggle: (preset: ViewportPreset) => Promise<void>;
  onAdd: () => void;
  presetsCountLabel: string;
  viewportPresets: ViewportPreset[];
}) {
  return (
    <div className="mb-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span className={settingsMetaLabelClassName}>
          {translate('viewportPresets.section.savedLabel')}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--sniptale-color-text-dim)]">
            {props.viewportPresets.length} {props.presetsCountLabel}
          </span>
          <div className="w-fit">
            <AddViewportPresetButton disabled={props.isLoading} onClick={props.onAdd} />
          </div>
        </div>
      </div>
      {(['viewport', 'window'] as const).map((target) => (
        <PresetGroup
          key={target}
          {...props}
          target={target}
          presets={props.viewportPresets.filter((preset) => preset.target === target)}
        />
      ))}
    </div>
  );
}
