import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  SettingsCollection,
  settingsPanelClassName,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../../section-surface';
import { getSettingsCountLabel } from '../../../../section-surface/text.helpers';
import { usePalettesController } from './controller';
import { EDITOR_PALETTE_KEYS, getEditorPaletteLabel } from './families';
import { CompactColorSelector } from '../../../../../ui/color-selector';

export function PalettesSettings() {
  const state = usePalettesController();
  const items: readonly SettingsCollectionItem[] = state.colors.map((color, index) => ({
    id: `${state.key}:${index}`,
    title: color,
    preview: <span className="h-full w-full" style={{ backgroundColor: color }} />,
    meta: (
      <label className="inline-flex items-center gap-2">
        <span>#{index + 1}</span>
        <CompactColorSelector
          label={`${getEditorPaletteLabel(state.key)} ${index + 1}`}
          title={`${getEditorPaletteLabel(state.key)} ${index + 1}`}
          value={color}
          pickerOnly
          onChange={(value) => void state.changeColor(index, value)}
          className="w-40"
        />
      </label>
    ),
    capabilities: { reorder: true },
  }));
  const parseIndex = (id: string | null) => {
    if (id === null) return null;
    const value = Number(id.slice(id.lastIndexOf(':') + 1));
    return Number.isInteger(value) ? value : null;
  };
  const onMove = (intent: SettingsCollectionMoveIntent) => {
    const itemIndex = parseIndex(intent.itemId);
    if (itemIndex === null) return;
    void state.moveColor(itemIndex, parseIndex(intent.beforeItemId));
  };

  return (
    <section className={`${settingsPanelClassName} space-y-4`}>
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
      <SettingsCollection
        ariaLabel={translate('settings.editor.paletteTitle')}
        title={translate('settings.editor.paletteTitle')}
        items={items}
        countLabel={`${items.length} ${getSettingsCountLabel(items.length, {
          one: 'settings.editor.colorCountOne',
          few: 'settings.editor.colorCountFew',
          many: 'settings.editor.colorCountMany',
        })}`}
        onAction={() => undefined}
        onMove={onMove}
      />
    </section>
  );
}
