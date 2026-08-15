import { useEffect, useState } from 'react';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { Gradient, Paint } from '@sniptale/foundation/paint';
import { translate } from '../../../../../platform/i18n';
import { CompactPaintSelector } from '../../../../../ui/paint-selector';
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

export function GradientPresetEditor(props: {
  onClose(): void;
  onSave(name: string, gradient: Gradient): Promise<boolean>;
  open: boolean;
  preset: StoredGradientPreset | null;
}) {
  const [name, setName] = useState('');
  const [paint, setPaint] = useState<Paint>({ kind: 'gradient', gradient: fallbackGradient() });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!props.open) return;
    setName(props.preset?.name ?? '');
    setPaint({
      kind: 'gradient',
      gradient: structuredClone(props.preset?.gradient ?? fallbackGradient()),
    });
  }, [props.open, props.preset]);
  const save = async () => {
    if (!name.trim() || paint.kind !== 'gradient' || saving) return;
    setSaving(true);
    try {
      const saved = await props.onSave(name.trim(), paint.gradient);
      if (saved) props.onClose();
    } catch {
      return;
    } finally {
      setSaving(false);
    }
  };
  return (
    <ProductModal
      dialogClassName={settingsModalClassName}
      isOpen={props.open}
      maxHeight="85vh"
      onClose={props.onClose}
      scrollable
      width="480px"
    >
      <ProductModalHeader
        compact
        disabled={saving}
        onClose={props.onClose}
        title={translate(
          props.preset
            ? 'settings.editor.gradients.editTitle'
            : 'settings.editor.gradients.addTitle'
        )}
      />
      <ProductModalBody compact>
        <div className="grid gap-4">
          <label className="grid gap-1 text-xs">
            {translate('settings.editor.presetName')}
            <input
              aria-label={translate('settings.editor.presetName')}
              disabled={saving}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>
          <CompactPaintSelector
            disabled={saving}
            label={translate('settings.editor.gradients.paint')}
            onChange={setPaint}
            title={translate('settings.editor.gradients.paint')}
            value={paint}
          />
          {paint.kind !== 'gradient' ? (
            <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
              {translate('settings.editor.gradients.gradientRequired')}
            </p>
          ) : null}
        </div>
      </ProductModalBody>
      <ProductModalFooter compact>
        <ProductActionButton disabled={saving} onClick={props.onClose}>
          {translate('common.actions.cancel')}
        </ProductActionButton>
        <ProductActionButton
          disabled={saving || !name.trim() || paint.kind !== 'gradient'}
          onClick={() => void save()}
          tone="primary"
        >
          {translate('common.actions.save')}
        </ProductActionButton>
      </ProductModalFooter>
    </ProductModal>
  );
}
