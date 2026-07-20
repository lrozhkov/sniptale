import { translate } from '../../../../../platform/i18n';

import { cx } from '../../../../chrome/ui';
import { PanelSection } from '../../../environment/shared';

export function EditorInspectorGridPresetSection(props: {
  applyGridColor: (color: string) => void;
  gridColor: string;
  gridPalette: readonly string[];
}) {
  return (
    <PanelSection label={translate('editor.compact.neutralPresets')}>
      <div className="grid grid-cols-4 gap-2">
        {props.gridPalette.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onClick={() => props.applyGridColor(color)}
            className={cx(
              'h-10 rounded-[12px] border transition hover:-translate-y-px',
              props.gridColor.toLowerCase() === color
                ? 'border-[color:var(--sniptale-color-border-accent-strong)] ' +
                    'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_10%,transparent)]'
                : 'border-[color:var(--sniptale-color-border-soft)]'
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </PanelSection>
  );
}
