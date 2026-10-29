import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate, useAppLocale } from '../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { useEffect, useState, type ReactNode } from 'react';
import { ensureNativeEditingRootAvailable } from '../workflows/sync-transfer/editing-admission';
import type { SyncNativeEditingRoot } from '../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { acquireAssetResourceSession } from './persistence/assets/resource-sessions';

const logger = createLogger({ namespace: 'EditorResourceAdmission' });

/** Mounted editor admission precedes every child read, including embedded Image and initial Montage. */
export function EditorResourceAdmission({
  children,
  root,
}: {
  children: ReactNode;
  root?: SyncNativeEditingRoot | undefined;
}) {
  useAppLocale();
  const [attempt, setAttempt] = useState(0);
  const [retryable, setRetryable] = useState(false);
  const [initialRoot] = useState(() => root);
  const [admitted, setAdmitted] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  useEffect(() => {
    setRetryable(false);
    let cancelled = false;
    let acquired = false;
    let release: (() => Promise<void>) | undefined;
    const close = async () => {
      const owned = release;
      release = undefined;
      await owned?.();
    };
    const admission = acquireAssetResourceSession()
      .then(async (session) => {
        if (cancelled) {
          await session.release();
          return;
        }
        acquired = true;
        release = session.release;
        try {
          if (initialRoot) await ensureNativeEditingRootAvailable(initialRoot);
          if (!cancelled) setAdmitted(true);
        } catch (error) {
          await close();
          throw error;
        }
        if (cancelled) {
          await close();
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (acquired && initialRoot) setRetryable(true);
          else setFailure(new Error('Editor resource admission failed.'));
        }
      });
    return () => {
      cancelled = true;
      void admission.then(close).catch(() => logger.warn('editor-resource-cleanup-deferred'));
    };
  }, [initialRoot, attempt]);
  if (failure) throw failure;
  if (admitted) return children;
  if (!initialRoot) return null;
  return retryable ? (
    <div role="alert">
      <p>{translate('shared.syncCache.prepareFailed')}</p>
      <ProductActionButton type="button" onClick={() => setAttempt((value) => value + 1)}>
        {translate('shared.syncCache.retry')}
      </ProductActionButton>
    </div>
  ) : (
    <p role="status">{translate('shared.syncCache.preparing')}</p>
  );
}
