import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { PromptTemplateEditorFields } from './fields';
import type { PromptTemplateEditorProps } from './types';
import type { usePromptTemplateEditorState } from './use-state';

function renderPromptTemplateEditorFooter(args: {
  isLoading: boolean;
  isSubmitDisabled: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <ProductModalFooter compact>
      <ProductActionButton tone="secondary" onClick={args.onClose} disabled={args.isLoading}>
        {translate('common.actions.cancel')}
      </ProductActionButton>
      <ProductActionButton
        tone="primary"
        compact
        onClick={args.onSubmit}
        disabled={args.isSubmitDisabled || args.isLoading}
      >
        {args.isLoading
          ? `${translate('common.states.saving')}...`
          : translate('common.actions.save')}
      </ProductActionButton>
    </ProductModalFooter>
  );
}

export function PromptTemplateEditorContent({
  isLoading = false,
  onClose,
  submitError = null,
  template,
  state,
}: Pick<PromptTemplateEditorProps, 'isLoading' | 'onClose' | 'submitError' | 'template'> & {
  state: ReturnType<typeof usePromptTemplateEditorState>;
}) {
  return (
    <ProductModal
      width="480px"
      maxHeight="85vh"
      scrollable
      accent="compact"
      backdropClassName="sniptale-ai-template-editor-backdrop"
      onClose={onClose}
      onKeyDown={state.actions.handleKeyDown}
      dialogClassName="sniptale-ai-template-editor-modal"
    >
      <ProductModalHeader
        compact
        title={
          template
            ? translate('templates.editor.editTitle')
            : translate('templates.editor.newTitle')
        }
        onClose={onClose}
        disabled={isLoading}
        closeTitle={translate('templates.editor.closeTitle')}
      />

      <ProductModalBody compact asForm onSubmit={state.actions.handleSubmit}>
        <PromptTemplateEditorFields isLoading={isLoading} state={state} />
        {submitError ? <div className="sniptale-error-text">{submitError}</div> : null}
      </ProductModalBody>
      {renderPromptTemplateEditorFooter({
        isLoading,
        isSubmitDisabled: state.validation.isDisabled,
        onClose,
        onSubmit: () => {
          void state.actions.handleSubmit();
        },
      })}
    </ProductModal>
  );
}
