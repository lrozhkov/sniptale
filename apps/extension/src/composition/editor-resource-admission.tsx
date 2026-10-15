import { useEffect, useState, type ReactNode } from 'react';
import { acquireAssetResourceSession } from './persistence/assets/resource-sessions';

/** Mounted editor admission precedes every child read, including embedded Image and initial Montage. */
export function EditorResourceAdmission({ children }: { children: ReactNode }) {
  const [admitted, setAdmitted] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  useEffect(() => {
    let cancelled = false;
    let release: (() => Promise<void>) | undefined;
    void acquireAssetResourceSession()
      .then(async (session) => {
        if (cancelled) {
          await session.release();
          return;
        }
        release = session.release;
        setAdmitted(true);
      })
      .catch(() => {
        if (!cancelled) setFailure(new Error('Editor resource admission failed.'));
      });
    return () => {
      cancelled = true;
      void release?.();
    };
  }, []);
  if (failure) throw failure;
  return admitted ? children : null;
}
