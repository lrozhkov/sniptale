import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  SettingsCollection,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../../section-surface';
import { usePalettesController } from './controller';
import { EDITOR_PALETTE_KEYS, getEditorPaletteLabel } from './families';
import { CompactColorSelector } from '../../../../../ui/color-selector';

export function PalettesSettings() {
  const state = usePalettesController();
  const paletteLabel = getEditorPaletteLabel(state.key);
  const items: readonly SettingsCollectionItem[] = state.colors.map((color, index) => {
    const colorLabel = `${paletteLabel}, ${String(index + 1)}`;
    return {
      id: `${state.key}:${index}`,
      title: (
        <CompactColorSelector
          className="max-w-56"
          label={colorLabel}
          onChange={(value) => void state.changeColor(index, value)}
          pickerOnly
          title={colorLabel}
          value={color}
        />
      ),
      capabilities: { reorder: true },
    };
  });
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
    <section className="space-y-3">
      <div
        aria-label={translate('settings.editor.paletteTitle')}
        className="flex flex-wrap items-center gap-2"
        role="group"
      >
        {EDITOR_PALETTE_KEYS.map((key) => (
          <ProductActionButton
            aria-pressed={state.key === key}
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
        items={items}
        onAction={() => undefined}
        onMove={onMove}
      />
    </section>
  );
}
