import { translate } from '../../../../../platform/i18n';
import type { ViewportPreset } from '../../../../../contracts/settings';
import { settingsMetaLabelClassName } from '../../../../section-surface';
import { PresetsListEmptyState } from './empty-state';
import { PresetRow } from './preset-row';

export function PresetsList(props: {
  hoveredViewportId: string | null;
  onDelete: (preset: ViewportPreset) => void;
  onEdit: (preset: ViewportPreset) => void;
  onHoverChange: (id: string | null) => void;
  presetsCountLabel: string;
  viewportPresets: ViewportPreset[];
}) {
  return (
    <div className="mb-6">
      <div className="mb-4 flex items-center justify-between">
        <span className={settingsMetaLabelClassName}>
          {translate('viewportPresets.section.savedLabel')}
        </span>
        <span className="text-xs text-[var(--sniptale-color-text-dim)]">
          {props.viewportPresets.length} {props.presetsCountLabel}
        </span>
      </div>

      {props.viewportPresets.length === 0 ? (
        <PresetsListEmptyState />
      ) : (
        <div className="space-y-2">
          {props.viewportPresets.map((preset) => (
            <PresetRow
              key={preset.id}
              preset={preset}
              hoveredViewportId={props.hoveredViewportId}
              onDelete={props.onDelete}
              onEdit={props.onEdit}
              onHoverChange={props.onHoverChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
