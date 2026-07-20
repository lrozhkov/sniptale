import React from 'react';
import { ExportDialog } from '../../export/dialog';
import { ExportProgressOverlay } from '../../export/progress-overlay';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../platform/i18n';
import type { VideoEditorOverlaysController } from '../../runtime/controller/contracts/surface';

interface VideoEditorWorkspaceOverlaysProps {
  controller: VideoEditorOverlaysController;
}

/**
 * Renders workspace-level export overlays.
 */
export function VideoEditorWorkspaceOverlays({
  controller,
}: VideoEditorWorkspaceOverlaysProps): React.JSX.Element {
  return (
    <>
      <ProductConfirmDialog
        isOpen={Boolean(controller.confirmDialog)}
        title={controller.confirmDialog?.title ?? ''}
        message={controller.confirmDialog?.message ?? ''}
        confirmText={controller.confirmDialog?.confirmText ?? ''}
        cancelText={controller.confirmDialog?.cancelText ?? ''}
        onConfirm={controller.onConfirmDialogConfirm}
        onCancel={controller.onConfirmDialogCancel}
      />
      {controller.exportDialog.isOpen && controller.exportDialog.settings ? (
        <ExportDialog
          selectedClipAvailable={controller.exportDialog.selectedClipId !== null}
          settings={controller.exportDialog.settings}
          onClose={controller.exportDialog.onClose}
          onChange={controller.exportDialog.onChange}
          onExport={controller.exportDialog.onExport}
        />
      ) : null}
      {controller.exportProgress.isRunning && controller.exportProgress.status ? (
        <ExportProgressOverlay
          status={controller.exportProgress.status}
          onCancel={controller.exportProgress.onCancel}
        />
      ) : null}
      {controller.exportFailure.error ? (
        <ExportFailureOverlay
          error={controller.exportFailure.error}
          onClose={controller.exportFailure.onClose}
          onRetry={controller.exportFailure.onRetry}
        />
      ) : null}
    </>
  );
}

function ExportFailureOverlay(props: {
  error: string;
  onClose(): void;
  onRetry(): void | Promise<void>;
}): React.JSX.Element {
  return (
    <ProductModal
      accent="compact"
      labelledBy="video-editor-export-failure-title"
      onClose={props.onClose}
      role="alertdialog"
      width="min(520px, calc(100vw - 32px))"
    >
      <ProductModalHeader
        compact
        title={
          <span id="video-editor-export-failure-title">
            {translate('videoEditor.exportDialog.failureTitle')}
          </span>
        }
        onClose={props.onClose}
      />
      <ProductModalBody compact className="gap-3">
        <p>{translate('videoEditor.exportDialog.failureDescription')}</p>
        <p role="alert" className="break-words text-xs text-[var(--sniptale-color-danger)]">
          {props.error.slice(0, 512)}
        </p>
      </ProductModalBody>
      <ProductModalFooter compact className="justify-end gap-2">
        <ProductActionButton compact tone="secondary" onClick={props.onClose}>
          {translate('videoEditor.exportDialog.failureClose')}
        </ProductActionButton>
        <ProductActionButton compact tone="primary" onClick={() => void props.onRetry()}>
          {translate('videoEditor.exportDialog.failureRetry')}
        </ProductActionButton>
      </ProductModalFooter>
    </ProductModal>
  );
}
