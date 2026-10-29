import { useEffect, useState } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { createSyncProductClient } from '../../../platform/runtime-messaging/sync-product-client';
import { loadGalleryLibrarySnapshot } from '../snapshot';
import { openInEditor } from '../actions/preview';
import { canOpenGalleryProject, type GalleryRemoteRootItem } from '../items/types';
import { translate } from '../../../platform/i18n';
import {
  createRemoteProjectController,
  type RemoteProjectPhase,
} from './remote-project-controller';

/** Preparation completion is checked against the selected version before native navigation. */
export function RemoteProjectActions({ item }: { item: GalleryRemoteRootItem }) {
  const [phase, setPhase] = useState<RemoteProjectPhase>('idle');
  const [controller] = useState(() =>
    createRemoteProjectController(item, {
      client: createSyncProductClient(),
      loadSnapshot: loadGalleryLibrarySnapshot,
      openEditor: openInEditor,
      onPhase: setPhase,
    })
  );
  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);
  const running = phase === 'running' || phase === 'cancel-refused';
  const message =
    phase === 'queued'
      ? 'gallery.app.remoteResolutionQueued'
      : phase === 'running'
        ? 'gallery.app.remotePreparing'
        : phase === 'failed'
          ? 'gallery.app.remoteFailed'
          : phase === 'cancelled'
            ? 'gallery.app.remoteCancelled'
            : phase === 'selection-changed'
              ? 'gallery.app.remoteSelectionChanged'
              : phase === 'cancel-refused'
                ? 'gallery.app.remoteCancelRefused'
                : null;
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('gallery.app.remoteHint')}
      </p>
      {item.remote.conflict ? (
        <div className="space-y-2">
          <p className="text-xs">{translate('gallery.app.remoteConflictHint')}</p>
          {(item.remote.versions ?? []).map((version, index) => (
            <ProductActionButton
              key={version.selection.operationId}
              compact
              tone="secondary"
              type="button"
              disabled={running || phase === 'queued' || item.remote.unavailable}
              onClick={() => void controller.resolve(version.selection)}
            >
              {version.deleted
                ? translate('gallery.app.remoteChooseDeletion')
                : translate('gallery.app.remoteChooseVersion').replace(
                    '{number}',
                    String(index + 1)
                  ) +
                  ': ' +
                  version.label}
            </ProductActionButton>
          ))}
        </div>
      ) : null}
      <ProductActionButton
        compact
        tone="secondary"
        type="button"
        disabled={running || !canOpenGalleryProject(item)}
        onClick={() => void controller.start()}
      >
        {translate('gallery.app.remoteDownloadOpen')}
      </ProductActionButton>
      {running ? (
        <ProductActionButton
          compact
          tone="secondary"
          type="button"
          onClick={() => void controller.cancel()}
        >
          {translate('gallery.app.remoteCancel')}
        </ProductActionButton>
      ) : null}
      {message ? (
        <p
          role={
            phase === 'failed' || phase === 'cancel-refused' || phase === 'selection-changed'
              ? 'alert'
              : 'status'
          }
          className="text-xs"
        >
          {translate(message)}
        </p>
      ) : null}
    </div>
  );
}
