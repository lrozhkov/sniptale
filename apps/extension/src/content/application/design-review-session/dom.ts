import { isPageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import { applyPageStyleMutation } from '../../selection/design-review/style/mutation';
import type { CssDeclarationRequest } from '../../selection/design-review/style/types';
import {
  browserAnnotationSession,
  type BrowserDomAnnotationRecord,
} from '../../parser/page-preparation/annotations';
import {
  resolveRecoveryLocator,
  createRecoveryLocator,
} from '../../parser/page-preparation/history/recovery-locators';
import {
  setDesignReviewTool,
  openDesignReviewTarget,
  dismissDesignReviewSelection,
} from '../../selection/design-review';
import { disableNavigationLock } from '../../selection/locker';
import { finalizeDesignReviewCommentDraft } from '../../overlay/design-review/session/comment-draft-finalization';
import {
  isPageStyleMutationElement,
  isPageStyleRestorationElement,
} from '../../selection/design-review/style/element';
import { deleteDesignReviewRecord } from '../../overlay/design-review/runtime/record';
import { flushPendingPageStyleHistory } from '../../overlay/design-review/runtime/actions';
import {
  findElementBySelector,
  findElementByCompositeSelector,
} from '../../platform/frame/selectors';
import { createReviewSessionRuntime } from './runtime';
import { DesignReviewSessionClient } from './client';
import { captureReviewPreview } from './preview';

/** Requires matching page and semantic evidence, including for a structural locator. */
export function resolveReviewTarget(record: BrowserDomAnnotationRecord): Element | null {
  if (record.evidence.pageUrl !== location.href) return null;
  const live = browserAnnotationSession.getLiveTarget(record.annotationId);
  const expected = [
    record.evidence.targetText,
    record.textChange?.before?.trim().slice(0, 500),
    record.textChange?.after?.trim().slice(0, 500),
  ];
  const expectedFrame =
    record.evidence.frame.kind === 'iframe'
      ? findElementBySelector(record.evidence.frame.selector)
      : null;
  if (record.evidence.frame.kind === 'iframe' && !expectedFrame) return null;
  const semantic =
    record.evidence.frame.kind === 'iframe'
      ? findElementByCompositeSelector({
          elementSelector: record.evidence.targetSelector,
          iframeSelector: record.evidence.frame.selector,
        })
      : findElementBySelector(record.evidence.targetSelector);
  const candidates = [live, semantic, resolveRecoveryLocator(record.evidence.locator)].filter(
    (candidate): candidate is Element => {
      if (!candidate?.isConnected) return false;
      if (record.evidence.frame.kind === 'top-document' && candidate.ownerDocument !== document)
        return false;
      if (
        record.evidence.frame.kind === 'iframe' &&
        candidate.ownerDocument.defaultView?.frameElement !== expectedFrame
      )
        return false;
      if (
        record.evidence.frame.kind === 'iframe' &&
        record.evidence.frame.url &&
        candidate.ownerDocument.location.href !== record.evidence.frame.url
      )
        return false;
      const text = candidate.textContent?.trim().slice(0, 500) ?? '';
      return (
        expected.includes(text) &&
        (!record.evidence.targetRole ||
          candidate.getAttribute('role') === record.evidence.targetRole)
      );
    }
  );
  const unique = new Set(candidates);
  return unique.size === 1 ? ([...unique][0] ?? null) : null;
}

/** Composes native page effects with one document-bound review client. */
export function createDocumentReviewSession(enableReview: (enabled: boolean) => void) {
  const client = new DesignReviewSessionClient();
  const review = createReviewSessionRuntime({
    request: (message) => client.request(message),
    connected: client.isConnected,
    annotations: {
      ...browserAnnotationSession,
      captureSnapshot() {
        const snapshot = browserAnnotationSession.captureSnapshot();
        for (const record of snapshot.domRecords) {
          const target = browserAnnotationSession.getLiveTarget(record.annotationId);
          if (target?.isConnected) record.evidence.locator = createRecoveryLocator(target);
        }
        return snapshot;
      },
    },
    pageUrl: () => location.href,
    pageTitle: () => document.title.slice(0, 2048),
    resolve: resolveReviewTarget,
    openTarget: (target) =>
      setDesignReviewTool('comment') && openDesignReviewTarget(target, 'feedback'),
    navigate: (url) => location.assign(url),
    restoreTarget: (record, target) => {
      if (!isPageStyleMutationElement(target)) return;
      const declarations: CssDeclarationRequest[] = [];
      for (const change of record.propertyChanges) {
        if (!isPageStyleProperty(change.property)) return;
        const value = target.style.getPropertyValue(change.property);
        const priority = target.style.getPropertyPriority(change.property);
        if (value === change.after.value && priority === change.after.priority) continue;
        if (value !== change.before.value || priority !== change.before.priority) return;
        declarations.push({
          property: change.property,
          value: change.after.value,
          priority: change.after.priority,
          source: 'inspector',
        });
      }
      if (
        declarations.length &&
        applyPageStyleMutation({ target, declarations }).status !== 'applied'
      )
        return;
      if (
        record.textChange &&
        target.childElementCount === 0 &&
        target.textContent === record.textChange.before
      )
        target.textContent = record.textChange.after;
    },
    removeTarget: (target) => {
      if (isPageStyleRestorationElement(target)) deleteDesignReviewRecord(target);
      dismissDesignReviewSelection();
    },
    clearTargets: async () => {
      finalizeDesignReviewCommentDraft();
      flushPendingPageStyleHistory();
      for (const record of browserAnnotationSession.captureSnapshot().domRecords) {
        const target = browserAnnotationSession.getLiveTarget(record.annotationId);
        if (target?.isConnected && isPageStyleRestorationElement(target))
          deleteDesignReviewRecord(target);
      }
      dismissDesignReviewSelection();
    },
    capture: (entry, source) => captureReviewPreview(entry, source, resolveReviewTarget),
    restoreMode: (value) => {
      enableReview(value.enabled);
      if (!value.enabled) return;
      setDesignReviewTool(value.tool);
      if (value.tool === 'navigate') disableNavigationLock();
    },
  });
  return { review, client };
}
