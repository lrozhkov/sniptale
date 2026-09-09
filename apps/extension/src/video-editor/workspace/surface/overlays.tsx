import React, { useId, useRef } from 'react';
import { useExportDialogFocus } from '../../export/dialog/focus';
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
      {controller.exportDialog.isOpen &&
      controller.exportDialog.settings &&
      controller.exportDialog.sourceDimensions ? (
        <ExportDialog
          selectedClipAvailable={controller.exportDialog.selectedClipId != null}
          selectedRangeAvailable={controller.exportDialog.selectedRangeAvailable ?? false}
          settings={controller.exportDialog.settings}
          sourceDimensions={controller.exportDialog.sourceDimensions}
          onClose={controller.exportDialog.onClose}
          onChange={controller.exportDialog.onChange}
          onExport={controller.exportDialog.onExport}
        />
      ) : null}
      {controller.exportProgress.isRunning && controller.exportProgress.status ? (
        <ExportProgressOverlay
          cancellationFailed={Boolean(controller.exportFailure.error)}
          status={controller.exportProgress.status}
          onCancel={controller.exportProgress.onCancel}
        />
      ) : null}
      {controller.exportFailure.error && !controller.exportProgress.isRunning ? (
        <ExportFailureOverlay
          onClose={controller.exportFailure.onClose}
          onRetry={controller.exportFailure.onRetry}
        />
      ) : null}
    </>
  );
}

function ExportFailureOverlay(props: {
  onClose(): void;
  onRetry(): void | Promise<void>;
}): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useExportDialogFocus(rootRef);
  return (
    <div ref={rootRef} className="contents">
      <ProductModal
        labelledBy={titleId}
        onClose={props.onClose}
        role="alertdialog"
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || event.defaultPrevented) return;
          event.preventDefault();
          event.stopPropagation();
          props.onClose();
        }}
        width="min(520px, calc(100vw - 32px))"
      >
        <ProductModalHeader
          compact
          title={<span id={titleId}>{translate('videoEditor.exportDialog.failureTitle')}</span>}
          onClose={props.onClose}
          closeTitle={translate('common.actions.close')}
        />
        <ProductModalBody compact className="gap-3">
          <p>{translate('videoEditor.exportDialog.failureDescription')}</p>
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
    </div>
  );
}
