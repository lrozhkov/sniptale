import { useCallback, useEffect, useState } from 'react';
import {
  isReviewCheckRootAvailable,
  scanDesignReviewChecks,
  type ReviewCheckResult,
  type ReviewCheckScope,
} from '../../../selection/design-review/checks/scan';

/** A result keeps its original live identity. Navigation never changes the retry root. */
export function useDesignReviewChecks(enabled: boolean, open: boolean, candidate: Element | null) {
  const [, setSourceRevision] = useState(0);
  const [initialScanAttempted, setInitialScanAttempted] = useState(false);
  const [scope, setScope] = useState<ReviewCheckScope>('selected');
  const [result, setResult] = useState<ReviewCheckResult | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [navigationFailed, setNavigationFailed] = useState(false);
  const run = useCallback((root: Element | null, kind: ReviewCheckScope) => {
    let next: ReviewCheckResult | null = null;
    try {
      if (root) next = scanDesignReviewChecks(root, kind);
    } catch {
      /* Retain the previous result for recovery. */
    }
    setUnavailable(!next);
    if (next) {
      setResult(next);
      setNavigationFailed(false);
    }
  }, []);
  const newScan = useCallback(
    () => run(scope === 'page' ? document.documentElement : candidate, scope),
    [run, scope, candidate]
  );
  useEffect(() => {
    if (!enabled) {
      setInitialScanAttempted(false);
      setResult(null);
      setUnavailable(false);
      setNavigationFailed(false);
    }
  }, [enabled]);
  useEffect(() => {
    // One automatic attempt belongs to each review session. Retargeting and failure require explicit actions.
    if (!enabled || !open || initialScanAttempted) return;
    setInitialScanAttempted(true);
    const kind = candidate ? scope : 'page';
    if (!candidate) setScope('page');
    run(kind === 'page' ? document.documentElement : candidate, kind);
  }, [enabled, open, initialScanAttempted, candidate, scope, run]);
  useEffect(() => {
    if (!enabled || !result) return;
    const update = () => setSourceRevision((value) => value + 1);
    const view = result.root.ownerDocument.defaultView;
    view?.addEventListener('resize', update);
    const observer = new MutationObserver(update);
    observer.observe(result.root.ownerDocument, { childList: true, subtree: true });
    return () => {
      view?.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, [enabled, result]);
  // Mutation and viewport notifications refresh availability without rebinding the source identity.
  const rootUnavailable = Boolean(result && !isReviewCheckRootAvailable(result.root));
  const view = result?.root.ownerDocument.defaultView;
  const currentViewport = view ? { width: view.innerWidth, height: view.innerHeight } : null;
  const viewportChanged = Boolean(
    result &&
    currentViewport &&
    (result.viewport.width !== currentViewport.width ||
      result.viewport.height !== currentViewport.height)
  );
  return {
    currentViewport,
    rootUnavailable,
    viewportChanged,
    scope,
    setScope,
    result,
    unavailable,
    navigationFailed,
    setNavigationFailed,
    newScan,
    recheck: () => {
      if (result) run(result.root, result.scope);
    },
    canScan: scope === 'page' || Boolean(candidate?.isConnected),
  };
}
export type DesignReviewChecks = ReturnType<typeof useDesignReviewChecks>;
