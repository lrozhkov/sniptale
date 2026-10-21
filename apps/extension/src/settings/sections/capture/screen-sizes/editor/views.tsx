import { InspectorFieldClear } from '../../../../../ui/compact-inspector-controls/text-field';
import { SettingsControlRow } from '../../../../section-surface';
import {
  useRef,
  type CSSProperties,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';

import { translate } from '../../../../../platform/i18n';
import type { ViewportPreset } from '../../../../../contracts/settings';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductModalBody, ProductModalFooter } from '@sniptale/ui/product-modal';
import {
  clampViewportDimension,
  maxViewportPresetDimension,
  resolveViewportPresetSubmitLabel,
} from './helpers';
import { VIEWPORT_PRESET_MAX_NAME_LENGTH } from '../../../../../features/viewport-presets/contracts';
import { isValidViewportPresetName } from '../../../../../features/viewport-presets/operations';

function ViewportPresetNameField(props: {
  disabled: boolean;
  label: string;
  setLabel: Dispatch<SetStateAction<string>>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const label = translate('viewportPresets.editor.nameLabel');
  return (
    <SettingsControlRow label={label}>
      <div className="sniptale-text-value">
        <ProductInput
          ref={input}
          aria-label={label}
          type="text"
          value={props.label}
          onChange={(event) => props.setLabel(event.target.value)}
          placeholder={translate('viewportPresets.editor.namePlaceholder')}
          maxLength={VIEWPORT_PRESET_MAX_NAME_LENGTH}
          required
          disabled={props.disabled}
          autoFocus
        />
        {props.label && !props.disabled ? (
          <InspectorFieldClear label={label} target={input} />
        ) : null}
      </div>
    </SettingsControlRow>
  );
}

const dimensionInputStyle: CSSProperties = {
  MozAppearance: 'textfield',
  WebkitAppearance: 'none',
  marginInlineStart: 'auto',
  maxWidth: 96,
  textAlign: 'right',
  display: 'block',
};

function ViewportPresetDimensionFields(props: {
  disabled: boolean;
  height: number;
  setHeight: Dispatch<SetStateAction<number>>;
  setWidth: Dispatch<SetStateAction<number>>;
  width: number;
}) {
  return (
    <div className="sniptale-parameter-stack">
      <div>
        <SettingsControlRow
          label={translate('viewportPresets.editor.widthLabel')}
          valueMinimum={80}
        >
          <ProductInput
            type="number"
            aria-label={translate('viewportPresets.editor.widthLabel')}
            value={props.width}
            onChange={(event) =>
              props.setWidth(clampViewportDimension(event.target.value, maxViewportPresetDimension))
            }
            min={1}
            max={maxViewportPresetDimension}
            required
            disabled={props.disabled}
            style={dimensionInputStyle}
          />
        </SettingsControlRow>
      </div>

      <div>
        <SettingsControlRow
          label={translate('viewportPresets.editor.heightLabel')}
          valueMinimum={80}
        >
          <ProductInput
            type="number"
            aria-label={translate('viewportPresets.editor.heightLabel')}
            value={props.height}
            onChange={(event) =>
              props.setHeight(
                clampViewportDimension(event.target.value, maxViewportPresetDimension)
              )
            }
            min={1}
            max={maxViewportPresetDimension}
            required
            disabled={props.disabled}
            style={dimensionInputStyle}
          />
        </SettingsControlRow>
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
        disabled={props.disabled || !isValidViewportPresetName(props.label)}
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
      <div className="space-y-4">
        <ViewportPresetNameField
          disabled={props.isDisabled}
          label={props.label}
          setLabel={props.setLabel}
        />
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
