import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { useCommandPress } from '@sniptale/ui/control-language/press';
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
  const trashPress = useCommandPress({
    disabled: menu.pending,
    onClick: () => {
      if (request.moveToTrash) void menu.run(request.moveToTrash);
    },
  });
  const permanentPress = useCommandPress({
    disabled: menu.pending,
    onClick: (event) => {
      if (event.detail <= 1) void menu.activatePermanent();
    },
  });
  if (!request.moveToTrash) {
    return (
      <div
        onKeyDownCapture={(event) => {
          if (event.repeat && ['Enter', ' ', 'Delete'].includes(event.key)) event.preventDefault();
        }}
      >
        <ProductConfirmDialog
          dialogClassName="sniptale-compact-workspace"
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
  const itemLayout =
    'flex min-h-9 w-full items-center gap-1.5 rounded-[4px] px-2 py-2 text-left text-[13px] ' +
    'leading-[18px] font-medium hover:bg-[var(--sniptale-color-surface-hover)] aria-disabled:opacity-50';
  return (
    <ContentPopoverAdapter
      isOpen
      anchorEl={request.anchor}
      popoverRef={menu.surfaceRef}
      style={menu.style}
      dataUi="gallery.deletion.menu"
      className="sniptale-compact-workspace sniptale-parameter-menu"
    >
      <div role="menu" aria-label={translate('common.actions.delete')}>
        <button
          type="button"
          role="menuitem"
          className={itemLayout}
          aria-disabled={menu.pending}
          data-command-press=""
          data-pressing={trashPress.pressed ? 'true' : undefined}
          {...trashPress.props}
        >
          <span className="sniptale-command-content">
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {translate('gallery.app.moveToTrash')}
          </span>
        </button>
        <div
          role="separator"
          className="my-1 border-t border-[var(--sniptale-color-border-soft)]"
        />
        <button
          type="button"
          role="menuitem"
          className={`${itemLayout} text-[var(--sniptale-color-danger)]`}
          aria-disabled={menu.pending}
          aria-describedby={menu.prepared || menu.pending ? warningId : undefined}
          data-command-press=""
          data-pressing={permanentPress.pressed ? 'true' : undefined}
          {...permanentPress.props}
        >
          <span className="sniptale-command-content">
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {translate(
              menu.prepared ? 'gallery.app.confirmPermanentDelete' : 'gallery.app.permanentDelete'
            )}
          </span>
        </button>
      </div>
      {menu.prepared || menu.pending ? (
        <p
          id={warningId}
          role="status"
          className="select-text px-3 py-2 text-sm leading-5 text-[var(--sniptale-color-text-secondary)]"
        >
          {menu.prepared?.warning ?? translate('gallery.app.deleteChecking')}
        </p>
      ) : null}
    </ContentPopoverAdapter>
  );
}
