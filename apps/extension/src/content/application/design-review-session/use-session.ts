import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { browserAnnotationSession } from '../../parser/page-preparation/annotations';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import {
  getDesignReviewModeState,
  subscribeToDesignReviewMode,
} from '../../selection/design-review';
import { disableNavigationLock } from '../../selection/locker';
import { finalizeDesignReviewCommentDraft } from '../../overlay/design-review/session/comment-draft-finalization';
import { flushPendingPageStyleHistory } from '../../overlay/design-review/runtime/actions';
import {
  createTrustedContentActionIntentSource,
  type ContentPrivilegedActionIntentSource,
} from '../privileged-action-intent';
import { resolveContentShadowRoot } from '../../platform/dom-host';
import type { ReviewSessionRuntime } from './runtime';
import { createDocumentReviewSession } from './dom';

export const ReviewSessionContext = createContext<ReviewSessionRuntime | null>(null);
export const useReviewSessionRuntime = () => useContext(ReviewSessionContext);

/** The mounted real-page layout composes the one review runtime for this document. */
export function useCreateReviewSessionRuntime(
  enableReview: (enabled: boolean) => void
): ReviewSessionRuntime {
  const enableReviewRef = useRef(enableReview);
  enableReviewRef.current = enableReview;
  const runtime = useMemo(
    () => createDocumentReviewSession((enabled) => enableReviewRef.current(enabled)),
    []
  );
  useEffect(() => {
    if (window.top !== window || !['https:', 'http:'].includes(location.protocol)) return;
    let disposed = false;
    const { review, client } = runtime;
    let source: ContentPrivilegedActionIntentSource | null = null;
    let captureTimer: ReturnType<typeof setTimeout> | undefined;
    let previousRevision = 0;
    const changed = () => {
      review.changed();
      if (source && review.getSnapshot().revision !== previousRevision) {
        clearTimeout(captureTimer);
        const intent = source;
        captureTimer = setTimeout(() => {
          void review.captureCurrent(intent);
        }, 600);
      }
      previousRevision = review.getSnapshot().revision;
    };
    const unsubscribe = browserAnnotationSession.subscribe(changed);
    const mode = () => {
      const current = getDesignReviewModeState();
      review.setMode(current.enabled, current.tool);
      if (current.tool === 'navigate') disableNavigationLock();
    };
    const unsubscribeMode = subscribeToDesignReviewMode(mode);
    const gesture = (event: Event) => {
      const host = resolveContentShadowRoot()?.host;
      if (!host || !event.composedPath().includes(host)) return;
      source = createTrustedContentActionIntentSource(event);
      queueMicrotask(changed);
    };
    const navigate = () => {
      if (!review.getSnapshot().active) return;
      finalizeDesignReviewCommentDraft();
      flushPendingPageStyleHistory();
      pagePreparationHistory.clear();
      review.navigatePage();
    };
    let page = location.href;
    const checkNavigation = () => {
      if (location.href !== page) {
        page = location.href;
        navigate();
      } else review.cancelNavigation();
    };
    const beginNavigation = () => {
      if (!review.getSnapshot().active) return;
      finalizeDesignReviewCommentDraft();
      flushPendingPageStyleHistory();
      review.beginNavigation();
    };
    const navigation = Reflect.get(window, 'navigation');
    if (navigation instanceof EventTarget) {
      navigation.addEventListener('navigate', beginNavigation);
      navigation.addEventListener('navigateerror', review.cancelNavigation);
      navigation.addEventListener('navigatesuccess', checkNavigation);
    }
    window.addEventListener('beforeunload', beginNavigation);
    window.addEventListener('popstate', checkNavigation);
    window.addEventListener('hashchange', checkNavigation);
    window.addEventListener('pointerup', gesture, true);
    window.addEventListener('keydown', gesture, true);
    window.addEventListener('focusout', gesture, true);
    const pagehide = () => {
      finalizeDesignReviewCommentDraft();
      changed();
      void review.flush().catch(() => undefined);
    };
    const pageshow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      page = location.href;
      client.dispose();
      void review
        .retry()
        .then(() => {
          if (disposed) return;
          review.navigatePage();
          mode();
        })
        .catch(() => undefined);
    };
    window.addEventListener('pageshow', pageshow);
    window.addEventListener('pagehide', pagehide);
    void review
      .open()
      .then(() => {
        if (!disposed) {
          mode();
          changed();
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      clearTimeout(captureTimer);
      unsubscribe();
      unsubscribeMode();
      if (navigation instanceof EventTarget) {
        navigation.removeEventListener('navigate', beginNavigation);
        navigation.removeEventListener('navigateerror', review.cancelNavigation);
        navigation.removeEventListener('navigatesuccess', checkNavigation);
      }
      window.removeEventListener('beforeunload', beginNavigation);
      window.removeEventListener('popstate', checkNavigation);
      window.removeEventListener('hashchange', checkNavigation);
      window.removeEventListener('pointerup', gesture, true);
      window.removeEventListener('keydown', gesture, true);
      window.removeEventListener('focusout', gesture, true);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', pageshow);
      review.dispose();
      client.dispose();
    };
  }, [runtime]);
  return runtime.review;
}
