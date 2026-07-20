import React from 'react';
import { translate } from '../../../../../platform/i18n';
import { PromptTemplateEditor } from '../../../../../features/prompt-templates/editor';
import { ProductModal, ProductModalBody, ProductModalHeader } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { AIModalDataPanel } from '../../data-panel';
import { TemplateList } from '../../template-list';
import type { AIModalProps } from './types';
import type { useAIModalState } from '../session';

type AIModalState = ReturnType<typeof useAIModalState>;
type AIModalDialogProps = {
  children: React.ReactNode;
  isLoading?: boolean;
  onCancelLoading?: () => void;
  onClose: () => void;
  promptField: React.ReactNode;
  state: AIModalState;
  title: React.ReactNode;
  treeData?: AIModalProps['treeData'];
};

function createModalEscapeHandler(args: { isLoading: boolean | undefined; onClose: () => void }) {
  return (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || args.isLoading) {
      return;
    }

    event.preventDefault();
    args.onClose();
  };
}

export function AIModalDialog({
  children,
  isLoading,
  onCancelLoading,
  onClose,
  promptField,
  state,
  title,
  treeData,
}: AIModalDialogProps) {
  const headerProps = {
    title,
    onClose,
    closeTitle: translate('aiModal.closeTitle'),
    ...(isLoading === undefined ? {} : { disabled: isLoading }),
  };
  const waitingStateProps = onCancelLoading === undefined ? {} : { onCancelLoading };

  return (
    <ProductModal
      closeOnBackdrop={false}
      dialogClassName="sniptale-ai-modal-root"
      onKeyDown={createModalEscapeHandler({ isLoading, onClose })}
    >
      <ProductModalHeader {...headerProps} />
      <ProductModalBody className="sniptale-ai-modal-body sniptale-modal-scroll">
        {promptField}
        <TemplateList
          templates={state.templates}
          isLoading={state.templatesLoading}
          onSelectTemplate={state.handleSelectTemplate}
          onEditTemplate={state.handleEditTemplate}
          onDeleteTemplate={state.handleDeleteTemplate}
          onAddTemplate={state.handleAddTemplate}
        />
        <AIModalDataPanel
          treeData={treeData ?? null}
          isLoading={isLoading ?? false}
          onSelectedDataChange={state.setSelectedData}
          selectedData={state.selectedData}
        />
        {isLoading ? <AIModalWaitingState {...waitingStateProps} /> : null}
      </ProductModalBody>
      {children}
    </ProductModal>
  );
}

function AIModalWaitingState(props: { onCancelLoading?: () => void }) {
  const buttonProps = {
    tone: 'secondary' as const,
    ...(props.onCancelLoading === undefined ? {} : { onClick: props.onCancelLoading }),
    ...(props.onCancelLoading ? {} : { disabled: true }),
  };

  return (
    <div className="sniptale-ai-modal-loading-state" data-ui="ai-modal.loading-state">
      <div
        className="sniptale-ai-modal-loading-spinner sniptale-spinner-inline"
        aria-hidden="true"
      />
      <div className="sniptale-ai-modal-loading-title">{translate('aiModal.waitingTitle')}</div>
      <p className="sniptale-ai-modal-loading-description">
        {translate('aiModal.waitingDescription')}
      </p>
      <ProductActionButton {...buttonProps}>
        {translate('aiModal.waitingCancelButton')}
      </ProductActionButton>
    </div>
  );
}

export function AIModalTemplateEditor({
  isLoading,
  onClose,
  onSave,
  state,
}: {
  isLoading?: boolean;
  onClose: () => void;
  onSave: AIModalState['handleSaveTemplate'];
  state: AIModalState;
}) {
  const editorProps = {
    isOpen: state.isEditorOpen,
    onClose,
    onSave,
    submitError: state.templateSubmitError,
    ...(state.editingTemplate === undefined ? {} : { template: state.editingTemplate }),
    ...(isLoading === undefined ? {} : { isLoading }),
  };

  return <PromptTemplateEditor {...editorProps} />;
}
