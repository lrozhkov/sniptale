import { ProductModalFooter } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../platform/i18n';

/** Callers retain reset eligibility, save effects, and the modal lifetime. */
export function HighlighterPresetEditorFooter(props: {
  isSaving: boolean;
  name: string;
  onClose: () => void;
  onReset?: (() => void | Promise<void>) | undefined;
  onSave: () => void;
  resetLabel: string;
}) {
  return (
    <ProductModalFooter compact>
      {props.onReset ? (
        <ProductActionButton
          tone="secondary"
          disabled={props.isSaving}
          onClick={() => void props.onReset?.()}
        >
          {props.resetLabel}
        </ProductActionButton>
      ) : null}
      <ProductActionButton tone="secondary" onClick={props.onClose}>
        {translate('common.actions.cancel')}
      </ProductActionButton>
      <ProductActionButton
        tone="primary"
        disabled={!props.name.trim() || props.isSaving}
        onClick={props.onSave}
      >
        {translate('common.actions.save')}
      </ProductActionButton>
    </ProductModalFooter>
  );
}
