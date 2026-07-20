import React from 'react';

import { useAppLocale } from '../../../platform/i18n';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { useEditorController } from '../../application/controller-context';
import {
  EditorInspectorDocumentActionsSection,
  renderEditorInspectorContentBody,
  type EditorInspectorDocumentActionsSectionProps,
} from '../content-sections';
import { createEditorInspectorContentBodyProps } from './params';

import type { EditorInspectorContentProps } from './types';

function renderEditorInspectorDocumentContent(props: EditorInspectorDocumentActionsSectionProps) {
  return <EditorInspectorDocumentActionsSection {...props} />;
}

export const EditorInspectorContent: React.FC<EditorInspectorContentProps> = (props) => {
  useAppLocale();
  const controller = useEditorController();

  const contentBodyProps = createEditorInspectorContentBodyProps(props);

  const confirmDialog = props.confirmDialog ? (
    <ProductConfirmDialog
      title={props.confirmDialog.title}
      message={props.confirmDialog.message}
      confirmText={props.confirmDialog.confirmText}
      cancelText={props.confirmDialog.cancelText}
      onConfirm={props.onConfirmDialogConfirm}
      onCancel={props.onConfirmDialogCancel}
    />
  ) : null;

  if (props.showDocumentActions) {
    return (
      <>
        {renderEditorInspectorDocumentContent(props)}
        {confirmDialog}
      </>
    );
  }

  return (
    <>
      <div className="space-y-5">
        {props.hasImage ? renderEditorInspectorContentBody(contentBodyProps, controller) : null}
      </div>
      {confirmDialog}
    </>
  );
};
