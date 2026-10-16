import { InspectorFieldClear } from '../../../../../ui/compact-inspector-controls/text-field';
import { ProductInput, ProductTextarea } from '@sniptale/ui/product-form-controls';
import { useEffect, useRef, useState } from 'react';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { SurfaceStyle } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { translate } from '../../../../../platform/i18n';
import { CompactPaintSelector } from '../../../../../ui/paint-selector';
import { canonicalizeSurfaceCss } from '../../../../../features/highlighter/surface-style/surface-css';
import type { ManagedSurfaceStylePreset } from '../../../../../composition/persistence/surface-style-presets';
import { settingsModalClassName } from '../../../../section-surface';

export function SurfaceStylePresetEditor(props: {
  onClose(): void;
  onSave(name: string, style: SurfaceStyle): Promise<boolean>;
  open: boolean;
  preset: ManagedSurfaceStylePreset | null;
}) {
  const [name, setName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const [style, setStyle] = useState<SurfaceStyle | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!props.open) return;
    setName(props.preset?.name ?? '');
    setStyle(
      props.preset
        ? structuredClone(props.preset.style)
        : { fillPaint: { kind: 'solid', color: '#ffffffff' }, surfaceCss: '' }
    );
  }, [props.open, props.preset]);
  if (!style) return null;
  const canonicalCss = canonicalizeSurfaceCss(style.surfaceCss);
  const save = async () => {
    if (!name.trim() || canonicalCss === null || saving) return;
    setSaving(true);
    try {
      const saved = await props.onSave(name.trim(), { ...style, surfaceCss: canonicalCss });
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
            ? 'settings.editor.surfaceStyles.editTitle'
            : 'settings.editor.surfaceStyles.addTitle'
        )}
      />
      <ProductModalBody compact>
        <div className="grid gap-3">
          <label
            className={[
              'grid gap-1 text-[13px] leading-[18px] font-medium',
              'text-[var(--sniptale-color-text-secondary)]',
            ].join(' ')}
          >
            {translate('settings.editor.presetName')}
            <div className="sniptale-text-value">
              <ProductInput
                ref={nameRef}
                aria-label={translate('settings.editor.presetName')}
                disabled={saving}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
              {!saving && name.length > 0 ? (
                <InspectorFieldClear
                  label={translate('settings.editor.presetName')}
                  target={nameRef}
                />
              ) : null}
            </div>
          </label>
          <CompactPaintSelector
            disabled={saving}
            label={translate('content.callout.surfaceStyle.paint')}
            onChange={(fillPaint) => setStyle((current) => ({ ...current!, fillPaint }))}
            title={translate('content.callout.surfaceStyle.paint')}
            value={style.fillPaint}
          />
          <label
            className={[
              'grid gap-1 text-[13px] leading-[18px] font-medium',
              'text-[var(--sniptale-color-text-secondary)]',
            ].join(' ')}
          >
            {translate('content.callout.surfaceStyle.advancedCss')}
            <ProductTextarea
              disabled={saving}
              maxLength={4000}
              onChange={(event) =>
                setStyle((current) => ({ ...current!, surfaceCss: event.target.value }))
              }
              rows={7}
              value={style.surfaceCss}
            />
          </label>
          {canonicalCss === null ? (
            <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
              {translate('content.callout.surfaceStyle.cssInvalid')}
            </p>
          ) : null}
        </div>
      </ProductModalBody>
      <ProductModalFooter compact>
        <ProductActionButton disabled={saving} onClick={props.onClose}>
          {translate('common.actions.cancel')}
        </ProductActionButton>
        <ProductActionButton
          disabled={saving || !name.trim() || canonicalCss === null}
          onClick={() => void save()}
          tone="primary"
        >
          {translate('common.actions.save')}
        </ProductActionButton>
      </ProductModalFooter>
    </ProductModal>
  );
}
