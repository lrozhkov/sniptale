import type { BrowserAnnotationTargetEvidence } from '../../../parser/page-preparation/annotations';
import { createPageStyleAnnotationEvidence } from '../../../selection/quick-edit-runtime/page-style/annotation';
import type { PageStyleSelectionSnapshot } from '../runtime/properties';
import { commitPropertiesComment, readPropertiesComment } from '../runtime/comment';

interface CommentDraftTarget {
  element: PageStyleSelectionSnapshot['element'];
  evidence: BrowserAnnotationTargetEvidence;
}

interface CommentDraftView {
  commitFailed: boolean;
  draft: string;
  marker: number | null;
}

interface CommentDraftModelResult {
  success: boolean;
  view: CommentDraftView | null;
}

function normalizeComment(value: string): string {
  return value.trim() === '' ? '' : value;
}

class PageStyleCommentDraftModel {
  private committedComment = '';
  private composing = false;
  private commitRequested = false;
  private currentTarget: CommentDraftTarget | null = null;
  private draft = '';
  private lastFailedComment: string | null = null;
  private marker: number | null = null;
  private pendingSelection: PageStyleSelectionSnapshot | null | undefined;

  readView(commitFailed = false): CommentDraftView {
    return { commitFailed, draft: this.draft, marker: this.marker };
  }

  updateDraft(value: string): CommentDraftView {
    this.draft = value;
    if (normalizeComment(value) !== this.lastFailedComment) {
      this.lastFailedComment = null;
    }
    return this.readView();
  }

  startComposition(): void {
    this.composing = true;
  }

  endComposition(value: string): CommentDraftModelResult {
    this.draft = value;
    this.composing = false;
    return this.commitRequested ? this.commit() : { success: true, view: this.readView() };
  }

  commit(): CommentDraftModelResult {
    return this.finishCommit(this.commitCurrentTarget(true));
  }

  close(): CommentDraftModelResult {
    this.composing = false;
    return this.finishCommit(this.commitCurrentTarget(false));
  }

  private finishCommit(result: CommentDraftModelResult): CommentDraftModelResult {
    if (!result.success || this.pendingSelection === undefined) {
      return result;
    }

    const pendingSelection = this.pendingSelection;
    this.pendingSelection = undefined;
    return this.transitionToSelection(pendingSelection);
  }

  select(selection: PageStyleSelectionSnapshot | null): CommentDraftModelResult {
    if (this.currentTarget?.element === selection?.element) {
      this.pendingSelection = undefined;
      return { success: true, view: null };
    }
    if (this.composing) {
      this.commitRequested = true;
      this.pendingSelection = selection;
      return { success: false, view: null };
    }

    const committed = this.commitCurrentTarget(false);
    if (!committed.success) {
      this.pendingSelection = selection;
      return committed;
    }
    return this.transitionToSelection(selection);
  }

  syncCommittedComment(): CommentDraftView | null {
    if (!this.currentTarget) {
      return null;
    }

    const nextCommitted = readPropertiesComment(this.currentTarget.element);
    if (nextCommitted.comment === this.committedComment && nextCommitted.marker === this.marker) {
      return null;
    }

    const cleanDraft = normalizeComment(this.draft) === this.committedComment;
    this.committedComment = nextCommitted.comment;
    this.marker = nextCommitted.marker;
    if (normalizeComment(this.draft) === nextCommitted.comment) {
      this.lastFailedComment = null;
    }
    if (cleanDraft) {
      this.draft = nextCommitted.comment;
    }
    return this.readView();
  }

  private commitCurrentTarget(allowFailedRetry: boolean): CommentDraftModelResult {
    if (this.composing) {
      this.commitRequested = true;
      return { success: false, view: null };
    }

    const nextComment = normalizeComment(this.draft);
    if (!this.currentTarget || nextComment === this.committedComment) {
      this.commitRequested = false;
      return { success: true, view: null };
    }
    if (!allowFailedRetry && nextComment === this.lastFailedComment) {
      this.commitRequested = false;
      return { success: false, view: this.readView(true) };
    }

    try {
      this.marker = commitPropertiesComment({
        comment: nextComment,
        evidence: this.currentTarget.evidence,
        target: this.currentTarget.element,
      });
      this.committedComment = nextComment;
      this.draft = nextComment;
      this.lastFailedComment = null;
      this.commitRequested = false;
      return { success: true, view: this.readView() };
    } catch {
      this.lastFailedComment = nextComment;
      this.commitRequested = false;
      return { success: false, view: this.readView(true) };
    }
  }

  private transitionToSelection(
    selection: PageStyleSelectionSnapshot | null
  ): CommentDraftModelResult {
    this.pendingSelection = undefined;
    if (!selection) {
      this.currentTarget = null;
      this.committedComment = '';
      this.draft = '';
      this.lastFailedComment = null;
      this.marker = null;
      return { success: true, view: this.readView() };
    }

    try {
      const committed = readPropertiesComment(selection.element);
      this.currentTarget = {
        element: selection.element,
        evidence: createPageStyleAnnotationEvidence(selection.element),
      };
      this.committedComment = committed.comment;
      this.draft = committed.comment;
      this.lastFailedComment = null;
      this.marker = committed.marker;
      return { success: true, view: this.readView() };
    } catch {
      this.currentTarget = null;
      this.committedComment = '';
      this.draft = '';
      this.lastFailedComment = null;
      this.marker = null;
      return { success: false, view: this.readView(true) };
    }
  }
}

export function createPageStyleCommentDraftModel() {
  return new PageStyleCommentDraftModel();
}
