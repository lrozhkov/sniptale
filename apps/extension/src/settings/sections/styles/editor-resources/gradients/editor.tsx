import { useEffect, useRef, useState } from 'react';
import { ProductModal } from '@sniptale/ui/product-modal';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import {
  useFormatMode,
  isEyedropperSessionActive,
} from '@sniptale/ui/color-selector/popover-state';
import type { Gradient, Paint } from '@sniptale/foundation/paint';
import { translate } from '../../../../../platform/i18n';
import type { GradientTemplateResources } from '../../../../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import { usePickerPreferences } from '../../../../../composition/picker-preferences/use-picker-preferences';
import { PaintSelectorPopup } from '../../../../../ui/paint-selector/popup';
import { usePaintHistory } from '../../../../../ui/paint-selector/history';
import {
  usePaintModeState,
  type PaintModeDrafts,
} from '../../../../../ui/paint-selector/mode-state';
import { usePaintSelectorLifecycle } from '../../../../../ui/paint-selector/lifecycle';
import { InspectorFieldClear } from '../../../../../ui/compact-inspector-controls/text-field';
import type { StoredGradientPreset } from '../../../../../composition/persistence/gradient-presets';
import { settingsModalClassName } from '../../../../section-surface';

function fallbackGradient(): Gradient {
  return {
    angle: 135,
    interpolation: 'oklab',
    repeat: { enabled: false, span: 1 },
    stops: [
      { color: '#f97316ff', id: 'settings-gradient-start', midpoint: 0.5, position: 0 },
      { color: '#ec4899ff', id: 'settings-gradient-end', midpoint: 0.5, position: 1 },
    ],
    type: 'linear',
  };
}

type EditorProps = {
  resources: GradientTemplateResources;
  palette: readonly string[];
  onClose(): void;
  onSave(name: string, gradient: Gradient): Promise<boolean>;
  open: boolean;
  preset: StoredGradientPreset | null;
};

function PresetName(props: { name: string; onChange(name: string): void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const label = translate('settings.editor.presetName');
  return (
    <div className="sniptale-text-value">
      <ProductInput
        ref={input}
        className="h-7! min-h-7! rounded-[4px]! py-0!"
        aria-label={label}
        placeholder={label}
        maxLength={80}
        disabled={props.disabled}
        value={props.name}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {!props.disabled && props.name.length > 0 ? (
        <InspectorFieldClear label={label} target={input} />
      ) : null}
    </div>
  );
}

function useGradientSession(preset: StoredGradientPreset | null) {
  const [original] = useState<Paint>(() => ({
    kind: 'gradient',
    gradient: structuredClone(preset?.gradient ?? fallbackGradient()),
  }));
  const [draft, setDraft] = useState(original);
  const [selectedStopId, selectStop] = useState<string | null>(
    original.kind === 'gradient' ? (original.gradient.stops[0]?.id ?? null) : null
  );
  const modeDrafts = useRef<PaintModeDrafts>({});
  const history = usePaintHistory({
    modeDrafts,
    draft,
    open: true,
    selected: selectedStopId,
    preview: setDraft,
    select: selectStop,
  });
  const createId = () => crypto.randomUUID();
  const setMode = usePaintModeState({
    modeDrafts,
    createId,
    draft,
    externalValue: original,
    open: true,
    preview: history.preview,
    selectStop,
  });
  return { original, draft, selectedStopId, selectStop, history, createId, setMode };
}

function GradientPresetSession(props: EditorProps) {
  const [name, setName] = useState(props.preset?.name ?? '');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
    return () => {
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, []);
  const eyedropper = useRef(false);
  const [section, setSection] = useState<'paint' | 'templates'>('paint');
  const session = useGradientSession(props.preset);
  const preferences = usePickerPreferences();
  const format = useFormatMode();
  const cancel = () => {
    if (!pending.current && !eyedropper.current && !isEyedropperSessionActive()) props.onClose();
  };
  usePaintSelectorLifecycle({
    cancel,
    disabled: undefined,
    eyedropperActiveRef: eyedropper,
    layerRef: root,
    rootRef: root,
    triggerRef: trigger,
    onOpenChange: undefined,
    open: true,
  });
  const save = async () => {
    if (!name.trim() || session.draft.kind !== 'gradient' || pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      if (await props.onSave(name.trim(), session.draft.gradient)) props.onClose();
    } catch {
      // Keep the local draft available for retry after a refused write.
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <ProductModal
      dialogClassName={settingsModalClassName}
      isOpen
      onClose={cancel}
      role="presentation"
      width="620px"
      maxWidth="calc(100vw - 24px)"
      maxHeight="calc(100vh - 24px)"
    >
      <div ref={root} className="flex max-h-[inherit] min-h-0 flex-col" aria-busy={saving}>
        <fieldset
          disabled={saving}
          inert={saving}
          className="m-0 flex max-h-[inherit] min-h-0 min-w-0 flex-col border-0 p-0"
        >
          <PaintSelectorPopup
            resources={props.resources}
            allowedModes={['linear', 'radial', 'conic']}
            nameField={<PresetName name={name} onChange={setName} disabled={saving} />}
            apply={() => void save()}
            applyLabel={translate('common.actions.save')}
            applyDisabled={saving || !name.trim()}
            showSaveTemplate={false}
            cancel={cancel}
            createId={session.createId}
            draft={session.draft}
            original={session.original}
            catalogMode={preferences.catalogMode}
            onCatalogModeChange={preferences.setCatalogMode}
            compact={preferences.compact}
            onToggleCompact={() => preferences.setCompact(!preferences.compact)}
            history={session.history}
            formatMode={format.formatMode}
            onCycleFormatMode={format.cycleFormatMode}
            onEyedropperStateChange={(active) => {
              eyedropper.current = active;
            }}
            onModeChange={session.setMode}
            palette={props.palette}
            preview={session.history.preview}
            recentColors={preferences.recentColors}
            selectedStopId={session.selectedStopId}
            selectStop={session.selectStop}
            section={section}
            setSection={setSection}
            title={translate(
              props.preset
                ? 'settings.editor.gradients.editTitle'
                : 'settings.editor.gradients.addTitle'
            )}
          />
        </fieldset>
      </div>
    </ProductModal>
  );
}

export function GradientPresetEditor(props: EditorProps) {
  return props.open ? <GradientPresetSession key={props.preset?.id ?? 'new'} {...props} /> : null;
}
