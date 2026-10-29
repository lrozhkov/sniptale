import { useSyncCacheFeedback, SyncCacheFeedback } from '../../../ui/sync-cache-feedback';
import { subscribeToMediaHubEvents } from '../../../features/media-hub/events';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { SyncCacheRootStatus } from '../../../contracts/sync-cache';
import type { SyncNativeEditingRoot } from '../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { createSyncProductClient } from '../../../platform/runtime-messaging/sync-product-client';
import { translate, useAppLocale } from '../../../platform/i18n';
import { isGalleryMediaItem, type GalleryItem } from '../items';

function nativeRoot(item: GalleryItem): SyncNativeEditingRoot | null {
  if (item.lifecycle?.trashedAt !== undefined) return null;
  if (item.type === 'video-project') return { rootKind: 'video-project', rootId: item.entityId };
  if (item.type === 'quick-edit-project')
    return { rootKind: 'video-review', rootId: item.entityId };
  if (item.type === 'scenario') return { rootKind: 'scenario-project', rootId: item.entityId };
  return isGalleryMediaItem(item) ? { rootKind: 'media', rootId: item.entityId ?? item.id } : null;
}

/** Native identities stay distinct from remote catalog selections. */
export function NativeCacheActions({ item }: { item: GalleryItem }) {
  const root = nativeRoot(item);
  return root ? (
    <NativeRootCacheActions key={JSON.stringify(root)} root={root} item={item} />
  ) : null;
}

function NativeRootCacheActions({
  root,
  item,
}: {
  root: SyncNativeEditingRoot;
  item: GalleryItem;
}) {
  useAppLocale();
  const [client] = useState(createSyncProductClient);
  const [status, setStatus] = useState<SyncCacheRootStatus | null>(null);
  const active = useRef(false);
  const {
    failed,
    setFailed,
    cancelRefused,
    setCancelRefused,
    releasedBytes,
    setReleasedBytes,
    deferred,
    setDeferred,
    running,
    setRunning,
    cancelling,
    cancel: cancelObservation,
  } = useSyncCacheFeedback(active, (id) => client.cancel(id));
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const request = useRef<{ id: string; kind: 'native' | 'native-release' } | null>(null);
  const waiter = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const read = useCallback(async () => {
    const current = ++revision.current;
    const result = await client.readNativeCacheRoot(root);
    if (
      result.kind !== 'cache-root' ||
      result.status.root.rootKind !== root.rootKind ||
      result.status.root.rootId !== root.rootId
    )
      throw new Error('Native cache status unavailable.');
    if (active.current && current === revision.current) setStatus(result.status);
  }, [client, root]);
  const disposeObservation = useCallback(() => {
    active.current = false;
    ++revision.current;
    waiter.current?.abort();
  }, []);
  useEffect(() => {
    active.current = true;
    return disposeObservation;
  }, [disposeObservation]);
  useEffect(() => {
    const invalidate = () => {
      void read().catch(() => {
        if (active.current) setFailed(true);
      });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') invalidate();
    };
    invalidate();
    const unsubscribe = subscribeToMediaHubEvents((event) => {
      if (event.type === 'library-changed') invalidate();
    });
    window.addEventListener('focus', invalidate);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', invalidate);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [read, item, setFailed]);
  const refresh = async () => {
    if (pending.current) return;
    setFailed(false);
    try {
      await read();
    } catch {
      if (active.current) setFailed(true);
    }
  };
  const observe = async (operation: NonNullable<typeof request.current>) => {
    waiter.current?.abort();
    const observation = new AbortController();
    waiter.current = observation;
    setFailed(false);
    try {
      const result = await client.waitForOperation(operation.id, observation.signal);
      if (!active.current || observation.signal.aborted || request.current !== operation) return;
      request.current = null;
      setRunning(false);
      const completion = result.completion;
      if (
        result.job?.state !== 'ready' ||
        !completion ||
        (completion.kind !== 'native' && completion.kind !== 'native-release') ||
        completion.kind !== operation.kind ||
        completion.root.rootId !== root.rootId ||
        completion.root.rootKind !== root.rootKind
      )
        throw new Error('Native cache operation did not complete.');
      if (completion.kind === 'native-release') {
        setReleasedBytes(completion.result.releasedBytes);
        setDeferred(
          Boolean(
            completion.result.unavailable + completion.result.busy + completion.result.protected
          )
        );
      }
    } catch {
      if (active.current && !observation.signal.aborted) setFailed(true);
    } finally {
      if (active.current && !observation.signal.aborted && request.current === null) {
        try {
          await read();
        } catch {
          if (active.current) setFailed(true);
        }
        pending.current = false;
        if (active.current) setBusy(false);
      }
    }
  };
  const command = async (action: 'pin' | 'download' | 'release') => {
    if (pending.current || !status) return;
    pending.current = true;
    ++revision.current;
    setBusy(true);
    setFailed(false);
    setCancelRefused(false);
    setReleasedBytes(null);
    setDeferred(false);
    try {
      const result =
        action === 'pin'
          ? await client.pinNative(root, !status.pinned)
          : action === 'download'
            ? await client.prepareNative(root)
            : await client.releaseNative(root);
      if (!active.current) return;
      if (result.kind === 'cache-root' && action === 'pin') {
        await read();
      } else if (result.kind === 'accepted') {
        const operation = {
          id: result.requestId,
          kind: action === 'release' ? ('native-release' as const) : ('native' as const),
        };
        request.current = operation;
        setRunning(true);
        await observe(operation);
      } else throw new Error('Native cache command refused.');
    } catch {
      if (active.current) {
        setFailed(true);
        try {
          await read();
        } catch {
          /* The command failure remains visible. */
        }
      }
    } finally {
      if (request.current === null && !cancelling.current) {
        pending.current = false;
        if (active.current) setBusy(false);
      }
    }
  };
  const cancel = async () => {
    const operation = request.current;
    if (!operation) return;
    await cancelObservation({
      requestId: operation.id,
      isCurrent: () => request.current === operation,
      async settle() {
        request.current = null;
        waiter.current?.abort();
        try {
          await read();
        } finally {
          pending.current = false;
          if (active.current) setBusy(false);
        }
      },
    });
  };
  if (status && !status.configured) return null;
  return (
    <section
      aria-label={translate('shared.syncCache.title')}
      aria-busy={busy}
      className="space-y-2"
    >
      <h3 className="text-sm font-medium">{translate('shared.syncCache.title')}</h3>
      {status ? (
        <>
          <p role="status" className="text-xs">
            {translate(
              status.pinned && !status.ready
                ? 'shared.syncCache.pinPending'
                : status.ready
                  ? 'shared.syncCache.local'
                  : 'shared.syncCache.remote'
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <ProductActionButton
              compact
              tone="secondary"
              disabled={busy}
              onClick={() => void command('pin')}
            >
              {translate(status.pinned ? 'shared.syncCache.unpin' : 'shared.syncCache.pin')}
            </ProductActionButton>
            {!status.ready ? (
              <ProductActionButton
                compact
                tone="secondary"
                disabled={busy}
                onClick={() => void command('download')}
              >
                {translate('shared.syncCache.download')}
              </ProductActionButton>
            ) : null}
            <ProductActionButton
              compact
              tone="secondary"
              disabled={busy || !status.releaseAllowed}
              onClick={() => void command('release')}
            >
              {translate('shared.syncCache.release')}
            </ProductActionButton>
          </div>
          {!status.releaseAllowed ? (
            <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
              {translate('shared.syncCache.notPublished')}
            </p>
          ) : null}
        </>
      ) : null}
      {busy || (!status && !failed) ? (
        <p role="status" className="text-xs">
          {translate('shared.syncCache.preparing')}
        </p>
      ) : null}
      {running ? (
        <ProductActionButton compact tone="secondary" onClick={() => void cancel()}>
          {translate('shared.syncCache.cancel')}
        </ProductActionButton>
      ) : null}
      {failed ? (
        <div className="space-y-2">
          <p role="alert" className="text-xs">
            {translate('shared.syncCache.prepareFailed')}
          </p>
          <ProductActionButton
            compact
            tone="secondary"
            onClick={() => void (request.current ? observe(request.current) : refresh())}
          >
            {translate('shared.syncCache.retry')}
          </ProductActionButton>
        </div>
      ) : null}
      <SyncCacheFeedback
        cancelRefused={cancelRefused}
        releasedBytes={releasedBytes}
        deferred={deferred}
      />
    </section>
  );
}
