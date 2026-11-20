import { NumericValueField } from '../../../../../ui/compact-inspector-controls/numeric';
import { InspectorFieldClear } from '../../../../../ui/compact-inspector-controls/text-field';
import { SettingsControlRow } from '../../../../section-surface';
import { useRef, type Dispatch, type FormEvent, type SetStateAction } from 'react';

import { translate } from '../../../../../platform/i18n';
import type { ViewportPreset } from '../../../../../contracts/settings';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductModalBody, ProductModalFooter } from '@sniptale/ui/product-modal';
import { maxViewportPresetDimension, resolveViewportPresetSubmitLabel } from './helpers';
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

function ViewportPresetDimensionFields(props: {
  disabled: boolean;
  height: number;
  setHeight: Dispatch<SetStateAction<number>>;
  setWidth: Dispatch<SetStateAction<number>>;
  width: number;
}) {
  const dimensions = [
    [translate('viewportPresets.editor.widthLabel'), props.width, props.setWidth],
    [translate('viewportPresets.editor.heightLabel'), props.height, props.setHeight],
  ] as const;

  return (
    <div className="sniptale-parameter-stack">
      {dimensions.map(([label, value, setValue]) => (
        <SettingsControlRow key={label} label={label}>
          <NumericValueField
            className="w-full!"
            label={label}
            value={value}
            min={1}
            max={maxViewportPresetDimension}
            unit="px"
            normalizeValue={Math.trunc}
            disabled={props.disabled}
            onPreviewValue={() => undefined}
            onCommitValue={setValue}
          />
        </SettingsControlRow>
      ))}
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
      <div className="sniptale-parameter-stack">
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
