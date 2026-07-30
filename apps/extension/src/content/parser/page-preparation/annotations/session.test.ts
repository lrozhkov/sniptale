// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createBrowserAnnotationSession } from './session';
import type { BrowserAnnotationTargetEvidence } from './types';

function createEvidence(selector = '#target'): BrowserAnnotationTargetEvidence {
  return {
    fileLabel: 'Target',
    frame: { kind: 'top-document' },
    locator: selector,
    nodePosition: { x: 20, y: 30 },
    pageUrl: 'https://example.test/page',
    targetPath: 'main > button',
    targetRole: 'button',
    targetSelector: selector,
    targetText: 'Target',
    viewport: { height: 720, width: 1280 },
  };
}

function createTarget(): Element {
  return document.createElement('button');
}

function createPropertyChange(args: {
  after: string;
  afterPriority?: string;
  before: string;
  beforePriority?: string;
  property?: string;
}) {
  return {
    after: { priority: args.afterPriority ?? '', value: args.after },
    before: { priority: args.beforePriority ?? '', value: args.before },
    order: 1,
    property: args.property ?? 'font-size',
  };
}

describe('browser annotation session live identity', () => {
  it('groups text, property, and comment evidence by the same Element identity', () => {
    const session = createBrowserAnnotationSession();
    const evidence = createEvidence();
    const target = createTarget();

    session.recordTextChange({ after: 'New', before: 'Old', evidence, target });
    session.recordPropertyChanges({
      changes: [createPropertyChange({ after: '24px', before: '16px' })],
      evidence,
      target,
    });
    expect(session.setComment({ comment: 'Prominent', evidence, target })).toBe(1);

    expect(session.captureSnapshot().domRecords).toEqual([
      expect.objectContaining({
        annotationId: 1,
        comment: 'Prominent',
        commentMarker: 1,
        propertyChanges: [createPropertyChange({ after: '24px', before: '16px' })],
        textChange: { after: 'New', before: 'Old' },
      }),
    ]);
    expect(session.getAnnotationId(target)).toBe(1);
    expect(session.getLiveTarget(1)).toBe(target);
  });

  it('does not rebind a detached annotation to an SPA replacement with the same selector', () => {
    const session = createBrowserAnnotationSession();
    const evidence = createEvidence('#same');
    const original = createTarget();
    const replacement = createTarget();

    session.setComment({ comment: 'Original', evidence, target: original });
    session.setComment({ comment: 'Replacement', evidence, target: replacement });

    expect(session.captureSnapshot().domRecords).toEqual([
      expect.objectContaining({ annotationId: 1, comment: 'Original' }),
      expect.objectContaining({ annotationId: 2, comment: 'Replacement' }),
    ]);
    expect(session.getLiveTarget(1)).toBe(original);
    expect(session.getLiveTarget(2)).toBe(replacement);
  });

  it('keeps the original value and priority baseline and removes returned evidence', () => {
    const session = createBrowserAnnotationSession();
    const evidence = createEvidence();
    const target = createTarget();

    session.recordPropertyChanges({
      changes: [
        createPropertyChange({
          after: '18px',
          before: '16px',
          beforePriority: 'important',
        }),
      ],
      evidence,
      target,
    });
    session.recordPropertyChanges({
      changes: [createPropertyChange({ after: '20px', before: '18px' })],
      evidence,
      target,
    });

    expect(session.captureSnapshot().domRecords[0]?.propertyChanges[0]).toEqual(
      createPropertyChange({
        after: '20px',
        before: '16px',
        beforePriority: 'important',
      })
    );

    session.recordPropertyChanges({
      changes: [
        createPropertyChange({
          after: '16px',
          afterPriority: 'important',
          before: '20px',
        }),
      ],
      evidence,
      target,
    });
    expect(session.captureSnapshot().domRecords).toEqual([]);
    expect(session.getAnnotationId(target)).toBeNull();
  });

  it('uses monotonic comment numbers when an empty record is removed and re-added', () => {
    const session = createBrowserAnnotationSession();
    const evidence = createEvidence();
    const target = createTarget();

    expect(session.setComment({ comment: 'First', evidence, target })).toBe(1);
    expect(session.setComment({ comment: '', evidence, target })).toBeNull();
    expect(session.setComment({ comment: 'Again', evidence, target })).toBe(2);

    expect(session.captureSnapshot().domRecords).toEqual([
      expect.objectContaining({ annotationId: 2, commentMarker: 2 }),
    ]);
  });

  it('removes only comment evidence while text and style keep the DOM annotation alive', () => {
    const session = createBrowserAnnotationSession();
    const evidence = createEvidence();
    const target = createTarget();
    session.recordTextChange({ after: 'New', before: 'Old', evidence, target });
    session.recordPropertyChanges({
      changes: [createPropertyChange({ after: '24px', before: '16px' })],
      evidence,
      target,
    });
    session.setComment({ comment: 'Temporary', evidence, target });

    session.setComment({ comment: '', evidence, target });

    expect(session.captureSnapshot().domRecords).toEqual([
      expect.objectContaining({
        propertyChanges: [createPropertyChange({ after: '24px', before: '16px' })],
        textChange: { after: 'New', before: 'Old' },
      }),
    ]);
    expect(session.captureSnapshot().domRecords[0]).not.toHaveProperty('comment');
    expect(session.captureSnapshot().domRecords[0]).not.toHaveProperty('commentMarker');
    expect(session.getAnnotationId(target)).toBe(1);
  });

  it('restores the original live target and identifiers through snapshot undo/redo', () => {
    const session = createBrowserAnnotationSession();
    const evidence = createEvidence();
    const target = createTarget();

    session.setComment({ comment: 'First', evidence, target });
    const withComment = session.captureSnapshot();
    session.setComment({ comment: '', evidence, target });
    const withoutComment = session.captureSnapshot();

    session.applySnapshot(withComment);
    expect(session.getAnnotationId(target)).toBe(1);
    expect(session.captureSnapshot().domRecords[0]).toMatchObject({
      annotationId: 1,
      commentMarker: 1,
    });

    session.applySnapshot(withoutComment);
    expect(session.getAnnotationId(target)).toBeNull();
    session.setComment({ comment: 'New', evidence, target });
    expect(session.captureSnapshot().domRecords[0]).toMatchObject({
      annotationId: 2,
      commentMarker: 2,
    });
  });

  it('restores allocators only for the exact failed synchronous mutation', () => {
    const session = createBrowserAnnotationSession();
    const evidence = createEvidence();
    const target = createTarget();
    const rollbackPoint = session.captureFailedMutationRollbackPoint();

    expect(session.setComment({ comment: 'Failed', evidence, target })).toBe(1);
    expect(session.rollbackFailedMutation(rollbackPoint)).toBe(true);
    expect(session.captureSnapshot()).toMatchObject({
      domRecords: [],
      nextAnnotationId: 1,
      nextCommentMarker: 1,
      nextCreationOrder: 1,
    });
    expect(session.setComment({ comment: 'Retry', evidence, target })).toBe(1);
  });

  it('refuses a failed-mutation rollback after an intervening session mutation', () => {
    const session = createBrowserAnnotationSession();
    const evidence = createEvidence();
    const rollbackPoint = session.captureFailedMutationRollbackPoint();
    const first = createTarget();
    const second = createTarget();

    session.setComment({ comment: 'First', evidence, target: first });
    session.setComment({ comment: 'Second', evidence, target: second });

    expect(session.rollbackFailedMutation(rollbackPoint)).toBe(false);
    expect(session.captureSnapshot().domRecords).toEqual([
      expect.objectContaining({ comment: 'First', commentMarker: 1 }),
      expect.objectContaining({ comment: 'Second', commentMarker: 2 }),
    ]);
  });

  it('keeps detached evidence exportable without throwing', () => {
    const session = createBrowserAnnotationSession();
    const target = createTarget();
    session.setComment({ comment: 'Detached', evidence: createEvidence(), target });

    expect(() => session.captureSnapshot()).not.toThrow();
    expect(session.captureSnapshot().domRecords[0]?.comment).toBe('Detached');
  });
});

describe('browser annotation session lifecycle', () => {
  it('tracks frame creation order and removes missing frames', () => {
    const session = createBrowserAnnotationSession();
    session.syncFrameIds(['frame-1', 'frame-2']);
    session.syncFrameIds(['frame-2', 'frame-3']);

    expect(session.captureSnapshot().frameOrders).toEqual([
      { creationOrder: 2, frameId: 'frame-2' },
      { creationOrder: 3, frameId: 'frame-3' },
    ]);
  });

  it('publishes real mutations, isolates evidence, and resets the document session', () => {
    const session = createBrowserAnnotationSession();
    const listener = vi.fn();
    const evidence = createEvidence();
    const target = createTarget();
    session.subscribe(listener);

    session.recordTextChange({ after: 'Same', before: 'Same', evidence, target });
    expect(listener).not.toHaveBeenCalled();
    session.setComment({ comment: 'Comment', evidence, target });
    evidence.nodePosition.x = 900;
    expect(session.captureSnapshot().domRecords[0]?.evidence.nodePosition.x).toBe(20);

    session.resetForDocument();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(session.captureSnapshot()).toMatchObject({
      domRecords: [],
      frameOrders: [],
      nextAnnotationId: 1,
      nextCommentMarker: 1,
      nextCreationOrder: 1,
    });
  });

  it('commits mutations even when one subscriber fails', () => {
    const session = createBrowserAnnotationSession();
    const followingListener = vi.fn();
    session.subscribe(() => {
      throw new Error('listener failed');
    });
    session.subscribe(followingListener);

    expect(() =>
      session.setComment({
        comment: 'Committed',
        evidence: createEvidence(),
        target: createTarget(),
      })
    ).not.toThrow();
    expect(followingListener).toHaveBeenCalledOnce();
  });
});
