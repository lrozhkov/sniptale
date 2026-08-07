import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { settingsPanelClassName } from '../../../../section-surface';
import {
  settingsListRowClassName,
  SettingsDragHandle,
} from '../../../../section-surface/panel-controls';
import { getSettingsCountLabel } from '../../../../section-surface/text.helpers';
import { usePalettesController } from './controller';
import { EDITOR_PALETTE_KEYS, getEditorPaletteLabel } from './families';

export function PalettesSettings() {
  const state = usePalettesController();
  return (
    <section className={`${settingsPanelClassName} space-y-4`}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold">{translate('settings.editor.paletteTitle')}</h2>
        <span className="text-xs text-[var(--sniptale-color-text-dim)]">
          {state.colors.length}{' '}
          {getSettingsCountLabel(state.colors.length, {
            one: 'settings.editor.colorCountOne',
            few: 'settings.editor.colorCountFew',
            many: 'settings.editor.colorCountMany',
          })}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {EDITOR_PALETTE_KEYS.map((key) => (
          <ProductActionButton
            key={key}
            compact
            tone="toggle"
            active={state.key === key}
            onClick={() => state.setKey(key)}
          >
            {getEditorPaletteLabel(key)}
          </ProductActionButton>
        ))}
      </div>
      <div className="space-y-2">
        {state.colors.map((color, index) => (
          <div
            key={`${state.key}-${index}-${color}`}
            draggable
            onDragStart={() => state.setDraggedIndex(index)}
            onDragOver={(event) => {
              event.preventDefault();
              if (state.draggedIndex !== index) state.setDragOverIndex(index);
            }}
            onDragEnd={state.clearDrag}
            onDrop={(event) => {
              event.preventDefault();
              void state.dropColor(index);
            }}
            className={[
              settingsListRowClassName,
              state.dragOverIndex === index ? 'border-[var(--sniptale-color-border-strong)]' : '',
            ].join(' ')}
          >
            <SettingsDragHandle />
            <span className="h-8 w-8 rounded-lg border" style={{ backgroundColor: color }} />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-[var(--sniptale-color-text-dim)]">#{index + 1}</div>
              <div className="truncate text-sm font-medium">{color}</div>
            </div>
            <input
              aria-label={`${getEditorPaletteLabel(state.key)} ${index + 1}`}
              type="color"
              value={color}
              onChange={(event) => void state.changeColor(index, event.currentTarget.value)}
              className="h-10 w-10 cursor-pointer rounded-lg border bg-transparent p-1"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
