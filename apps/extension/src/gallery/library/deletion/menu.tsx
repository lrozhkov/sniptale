import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { useId } from 'react';
import { Trash2, X } from 'lucide-react';
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
  const itemLayout = 'w-full !justify-start gap-2 !whitespace-normal text-left';
  return (
    <ContentPopoverAdapter
      isOpen
      anchorEl={request.anchor}
      popoverRef={menu.surfaceRef}
      style={menu.style}
      dataUi="gallery.deletion.menu"
    >
      <div role="menu" aria-label={translate('common.actions.delete')}>
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
          <X aria-hidden="true" className="h-4 w-4" />
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
