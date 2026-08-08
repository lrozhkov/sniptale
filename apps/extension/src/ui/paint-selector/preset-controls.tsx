import { useRef, useState } from 'react';
import { serializePaintToCss, type Gradient } from '@sniptale/foundation/paint';
import { translate } from '../../platform/i18n';

const PRESET_NAME_CLASS_NAME =
  'h-8 min-w-0 flex-1 rounded-[7px] border border-[var(--sniptale-color-border-soft)] bg-transparent px-2 text-xs';
const PRESET_SWATCH_CLASS_NAME = [
  'relative h-9 overflow-hidden rounded-[8px]',
  'border border-[var(--sniptale-color-border-soft)] aria-pressed:ring-2',
  'aria-pressed:ring-[var(--sniptale-color-accent)]',
].join(' ');

export interface GradientPresetOption {
  id: string;
  name: string;
  origin: 'system' | 'user';
  gradient: Gradient;
  favorite: boolean;
}

export interface GradientPresetActions {
  onApply: (preset: GradientPresetOption) => void;
  onDelete?: (id: string) => boolean | Promise<boolean>;
  onSave?: (name: string, gradient: Gradient) => boolean | Promise<boolean>;
  onToggleFavorite?: (id: string) => boolean | Promise<boolean>;
  onUpdate?: (id: string, gradient: Gradient) => boolean | Promise<boolean>;
}

function GradientPresetSaveControl(props: {
  gradient: Gradient;
  onSave: NonNullable<GradientPresetActions['onSave']>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [name, setName] = useState('');
  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      if (await props.onSave(trimmed, props.gradient)) {
        setName('');
        setExpanded(false);
      }
    } catch {
      return;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="text-xs text-[var(--sniptale-color-accent)]"
        disabled={pending}
        onClick={() => setExpanded((value) => !value)}
      >
        {translate('highlighter.paintPicker.saveAs')}
      </button>
      {expanded ? (
        <div className="col-span-2 flex gap-2">
          <input
            autoFocus
            aria-label={translate('highlighter.paintPicker.presetName')}
            className={PRESET_NAME_CLASS_NAME}
            maxLength={80}
            disabled={pending}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save();
            }}
          />
          <button
            type="button"
            className="text-xs"
            disabled={!name.trim() || pending}
            onClick={() => void save()}
          >
            {translate('highlighter.paintPicker.save')}
          </button>
        </div>
      ) : null}
    </>
  );
}

function GradientPresetGrid(props: {
  actions: GradientPresetActions | undefined;
  presets: readonly GradientPresetOption[] | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="col-span-2 grid grid-cols-4 gap-2">
      {props.presets?.map((preset) => (
        <button
          key={preset.id}
          type="button"
          title={preset.name}
          aria-label={preset.name}
          aria-pressed={props.selectedId === preset.id}
          className={PRESET_SWATCH_CLASS_NAME}
          style={{
            backgroundImage: serializePaintToCss({ kind: 'gradient', gradient: preset.gradient }),
          }}
          onClick={() => {
            props.onSelect(preset.id);
            props.actions?.onApply(preset);
          }}
        >
          {preset.favorite ? (
            <span aria-hidden className="absolute right-1 top-0 text-[10px]">
              ★
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function SelectedGradientPresetActions(props: {
  actions: GradientPresetActions | undefined;
  gradient: Gradient;
  selected: GradientPresetOption | null;
}) {
  if (!props.selected) return null;
  const selected = props.selected;
  return (
    <div className="col-span-2 flex flex-wrap gap-3 text-xs">
      {props.actions?.onToggleFavorite ? (
        <button type="button" onClick={() => void props.actions?.onToggleFavorite?.(selected.id)}>
          {translate('highlighter.paintPicker.favorite')}
        </button>
      ) : null}
      {selected.origin === 'user' && props.actions?.onUpdate ? (
        <button
          type="button"
          onClick={() => void props.actions?.onUpdate?.(selected.id, props.gradient)}
        >
          {translate('highlighter.paintPicker.update')}
        </button>
      ) : null}
      {selected.origin === 'user' && props.actions?.onDelete ? (
        <button type="button" onClick={() => void props.actions?.onDelete?.(selected.id)}>
          {translate('highlighter.paintPicker.delete')}
        </button>
      ) : null}
    </div>
  );
}

export function GradientPresetControls(props: {
  actions?: GradientPresetActions;
  gradient: Gradient;
  presets?: readonly GradientPresetOption[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = props.presets?.find((preset) => preset.id === selectedId) ?? null;
  if (!props.presets?.length && !props.actions?.onSave) return null;

  return (
    <div
      className="grid grid-cols-[1fr_auto] gap-2 border-t border-[var(--sniptale-color-border-soft)] pt-3"
      data-ui="shared.ui.paint-selector.presets"
    >
      <span className="text-xs font-semibold">{translate('highlighter.paintPicker.presets')}</span>
      {props.actions?.onSave ? (
        <GradientPresetSaveControl gradient={props.gradient} onSave={props.actions.onSave} />
      ) : null}
      <GradientPresetGrid
        actions={props.actions}
        presets={props.presets}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <SelectedGradientPresetActions
        actions={props.actions}
        gradient={props.gradient}
        selected={selected}
      />
    </div>
  );
}
