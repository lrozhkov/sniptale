import type { Dispatch, FormEvent, SetStateAction } from 'react';

import { translate } from '../../../../platform/i18n';
import type { ViewportPreset } from '../../../../contracts/settings';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductField, ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductModalBody, ProductModalFooter } from '@sniptale/ui/product-modal';
import { settingsModalFieldSurfaceClassName } from './surface/classes';
import { clampViewportDimension, resolveViewportPresetSubmitLabel } from './helpers';

function ViewportPresetNameField(props: {
  disabled: boolean;
  label: string;
  setLabel: Dispatch<SetStateAction<string>>;
}) {
  return (
    <ProductField label={translate('viewportPresets.editor.nameLabel')}>
      <ProductInput
        type="text"
        value={props.label}
        onChange={(event) => props.setLabel(event.target.value)}
        placeholder={translate('viewportPresets.editor.namePlaceholder')}
        required
        disabled={props.disabled}
        autoFocus
      />
    </ProductField>
  );
}

function ViewportPresetDimensionFields(props: {
  disabled: boolean;
  height: number;
  setHeight: Dispatch<SetStateAction<number>>;
  setWidth: Dispatch<SetStateAction<number>>;
  width: number;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <ProductField label={translate('viewportPresets.editor.widthLabel')}>
          <ProductInput
            type="number"
            value={props.width}
            onChange={(event) => props.setWidth(clampViewportDimension(event.target.value, 3840))}
            min={1}
            max={3840}
            required
            disabled={props.disabled}
            style={{ MozAppearance: 'textfield', WebkitAppearance: 'none' }}
          />
        </ProductField>
      </div>

      <div>
        <ProductField label={translate('viewportPresets.editor.heightLabel')}>
          <ProductInput
            type="number"
            value={props.height}
            onChange={(event) => props.setHeight(clampViewportDimension(event.target.value, 2160))}
            min={1}
            max={2160}
            required
            disabled={props.disabled}
            style={{ MozAppearance: 'textfield', WebkitAppearance: 'none' }}
          />
        </ProductField>
      </div>
    </div>
  );
}

export function ViewportPresetEditorFooter(props: {
  disabled: boolean;
  isSaving: boolean;
  label: string;
  onClose: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
  preset?: ViewportPreset;
}) {
  const submitLabelArgs =
    props.preset === undefined
      ? { isSaving: props.isSaving }
      : { isSaving: props.isSaving, preset: props.preset };

  return (
    <ProductModalFooter compact>
      <ProductActionButton
        type="button"
        onClick={props.onClose}
        disabled={props.disabled}
        tone="secondary"
      >
        {translate('common.actions.cancel')}
      </ProductActionButton>
      <ProductActionButton
        type="submit"
        onClick={props.onSubmit}
        disabled={props.disabled || !props.label.trim()}
        tone="primary"
      >
        {resolveViewportPresetSubmitLabel(submitLabelArgs)}
      </ProductActionButton>
    </ProductModalFooter>
  );
}

export function ViewportPresetEditorContent(props: {
  height: number;
  isDisabled: boolean;
  label: string;
  onSubmit: (event: FormEvent) => Promise<void>;
  setHeight: Dispatch<SetStateAction<number>>;
  setLabel: Dispatch<SetStateAction<string>>;
  setWidth: Dispatch<SetStateAction<number>>;
  width: number;
}) {
  return (
    <ProductModalBody compact asForm onSubmit={props.onSubmit}>
      <div className={settingsModalFieldSurfaceClassName}>
        <ViewportPresetNameField
          disabled={props.isDisabled}
          label={props.label}
          setLabel={props.setLabel}
        />
      </div>
      <div className={settingsModalFieldSurfaceClassName}>
        <ViewportPresetDimensionFields
          disabled={props.isDisabled}
          height={props.height}
          setHeight={props.setHeight}
          setWidth={props.setWidth}
          width={props.width}
        />
      </div>
    </ProductModalBody>
  );
}
