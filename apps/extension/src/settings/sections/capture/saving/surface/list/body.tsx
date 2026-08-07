import { PresetsListEmptyState } from './empty-state';
import { createPresetRowProps } from './props';
import { PresetRow } from './preset-row';
import type { SavePresetsListBodyProps } from '../../state/types';

export function PresetsListBody(props: SavePresetsListBodyProps) {
  return props.presets.length === 0 ? (
    <PresetsListEmptyState />
  ) : (
    <div className="space-y-2">
      {props.presets.map((preset) => (
        <PresetRow key={preset.id} {...createPresetRowProps(props, preset)} />
      ))}
    </div>
  );
}
