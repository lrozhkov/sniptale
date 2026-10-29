import { useEffect, useRef, useState } from 'react';
import { colorIdentity, getCssColorName } from '../../../../../ui/color-selector/catalog-model';
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
import { usePalettePresentation } from './presentation';

export function PalettesSettings() {
  const state = usePalettesController();
  const presentation = usePalettePresentation(state.key, state.colors);
  const paletteLabel = getEditorPaletteLabel(state.key);
  const items: readonly SettingsCollectionItem[] = state.colors.map((color, index) => {
    const colorLabel = `${paletteLabel}, ${String(index + 1)}`;
    return {
      id: presentation.ids[index]!,
      title: (
        <div className="grid gap-1">
          <PaletteNameEditor
            key={colorIdentity(color)}
            color={color}
            name={state.names?.[colorIdentity(color) ?? ''] ?? ''}
            onSave={(name) => state.renameColor(color, name)}
          />
          <CompactColorSelector
            className="max-w-56"
            label={colorLabel}
            onChange={(value) => {
              presentation.clearPlan();
              void state.changeColor(index, value);
            }}
            pickerOnly
            title={colorLabel}
            value={color}
          />
        </div>
      ),
      capabilities: { reorder: true },
    };
  });
  const parseIndex = (id: string | null) => {
    if (id === null) return null;
    const value = presentation.ids.indexOf(id);
    return value >= 0 ? value : null;
  };
  const onMove = (intent: SettingsCollectionMoveIntent) => {
    const itemIndex = parseIndex(intent.itemId);
    if (itemIndex === null) return;
    const beforeIndex = parseIndex(intent.beforeItemId);
    presentation.prepareMove(itemIndex, beforeIndex);
    return state.moveColor(itemIndex, beforeIndex);
  };

  return (
    <div>
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
        {state.key === 'drawing' ? (
          <p className="text-[13px] leading-[18px] text-[var(--sniptale-color-text-secondary)]">
            {translate('settings.editor.drawingQuickColorsDescription')}
          </p>
        ) : null}
        <SettingsCollection
          layout="tiles"
          ariaLabel={translate('settings.editor.paletteTitle')}
          items={items}
          onAction={() => undefined}
          onMove={onMove}
        />
      </section>
    </div>
  );
}

function PaletteNameEditor(props: {
  color: string;
  name: string;
  onSave: (name: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(props.name);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    setDraft(props.name);
    setFailed(false);
  }, [props.color, props.name]);
  const save = async () => {
    if (pending.current || draft.trim() === props.name) return;
    pending.current = true;
    setBusy(true);
    try {
      setFailed(!(await props.onSave(draft.trim())));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <input
      type="text"
      maxLength={80}
      value={draft}
      disabled={busy}
      aria-invalid={failed || undefined}
      aria-label={`${translate('shared.ui.colorCatalogName')}: ${props.color}`}
      placeholder={getCssColorName(props.color) ?? translate('shared.ui.colorCatalogName')}
      className={[
        'h-8 w-full min-w-0 rounded-[4px] border border-transparent bg-transparent px-2 text-[13px]',
        'text-[var(--sniptale-color-text-primary)] hover:border-[var(--sniptale-color-border-soft)]',
        'hover:bg-[var(--sniptale-color-surface-input)] focus:border-[var(--sniptale-color-border-soft)]',
        'focus:bg-[var(--sniptale-color-surface-input)] focus:outline-none',
        'focus-visible:border-[var(--sniptale-color-border-strong)]',
      ].join(' ')}
      onChange={(event) => {
        setDraft(event.currentTarget.value);
        setFailed(false);
      }}
      onBlur={() => void save()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          void save();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(props.name);
          setFailed(false);
        }
      }}
    />
  );
}
