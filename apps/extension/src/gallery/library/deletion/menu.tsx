import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { useId } from 'react';
import { Trash2 } from 'lucide-react';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import { translate } from '../../../platform/i18n';
import type { GalleryDeletionRequest } from './types';
import { useDeletionMenu } from './use-deletion-menu';

export function GalleryDeletionMenu({
  request,
  contextKey,
  onClose,
}: {
  request: GalleryDeletionRequest;
  contextKey: string;
  onClose: () => void;
}) {
  const warningId = useId();
  const menu = useDeletionMenu(request, contextKey, onClose);
  if (!request.moveToTrash) {
    return (
      <div
        onKeyDownCapture={(event) => {
          if (event.repeat && ['Enter', ' ', 'Delete'].includes(event.key)) event.preventDefault();
        }}
      >
        <ProductConfirmDialog
          title={translate('gallery.app.permanentDelete')}
          message={menu.prepared?.warning ?? translate('gallery.app.deleteChecking')}
          confirmText={translate('gallery.app.permanentDelete')}
          cancelText={translate('common.actions.cancel')}
          confirmDisabled={!menu.prepared || menu.pending}
          isLoading={menu.committing}
          onCancel={menu.dismiss}
          onConfirm={menu.activatePermanent}
        />
      </div>
    );
  }
  const itemLayout = 'w-full !justify-start gap-2 !whitespace-normal !min-h-9 text-left';
  return (
    <ContentPopoverAdapter
      isOpen
      anchorEl={request.anchor}
      popoverRef={menu.surfaceRef}
      style={menu.style}
      dataUi="gallery.deletion.menu"
      className="!rounded-[10px] !bg-[var(--sniptale-color-surface-canvas)]
        !bg-[linear-gradient(var(--sniptale-color-surface-panel),var(--sniptale-color-surface-panel))]"
    >
      <div role="menu" className="space-y-1 p-1" aria-label={translate('common.actions.delete')}>
        {request.moveToTrash ? (
          <button
            type="button"
            role="menuitem"
            className={`${getControlSecondaryButtonClassName({ density: 'compact' })} ${itemLayout}`}
            aria-disabled={menu.pending}
            onClick={() => void menu.run(request.moveToTrash!)}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {translate('gallery.app.moveToTrash')}
          </button>
        ) : null}
        <div
          role="separator"
          className="my-1 border-t border-[var(--sniptale-color-border-soft)]"
        />
        <button
          type="button"
          role="menuitem"
          className={`${getControlSecondaryButtonClassName({ density: 'compact', tone: 'danger' })} ${itemLayout}`}
          aria-disabled={menu.pending}
          aria-describedby={menu.prepared || menu.pending ? warningId : undefined}
          onClick={(event) => {
            if (event.detail <= 1) void menu.activatePermanent();
          }}
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          {translate(
            menu.prepared ? 'gallery.app.confirmPermanentDelete' : 'gallery.app.permanentDelete'
          )}
        </button>
      </div>
      {menu.prepared || menu.pending ? (
        <p
          id={warningId}
          role="status"
          className="px-3 py-2 text-xs text-[var(--sniptale-color-text-secondary)]"
        >
          {menu.prepared?.warning ?? translate('gallery.app.deleteChecking')}
        </p>
      ) : null}
    </ContentPopoverAdapter>
  );
}
