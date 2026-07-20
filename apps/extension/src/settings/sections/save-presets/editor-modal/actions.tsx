import { translate } from '../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductModalFooter } from '@sniptale/ui/product-modal';
import type { SavePreset } from '../../../../contracts/settings';
import { resolveSavePresetSubmitLabel } from './copy';

export function SavePresetEditorActions(props: {
  disabled: boolean;
  onClose: () => void;
  preset?: SavePreset;
  saving: boolean;
}) {
  const submitLabelArgs =
    props.preset === undefined
      ? { saving: props.saving }
      : { preset: props.preset, saving: props.saving };

  return (
    <ProductModalFooter compact>
      <ProductActionButton type="button" onClick={props.onClose} tone="secondary">
        {translate('common.actions.cancel')}
      </ProductActionButton>
      <ProductActionButton type="submit" disabled={props.disabled} tone="primary">
        {resolveSavePresetSubmitLabel(submitLabelArgs)}
      </ProductActionButton>
    </ProductModalFooter>
  );
}
