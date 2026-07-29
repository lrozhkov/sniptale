import { describe, expect, it, vi } from 'vitest';
import { createBrowserAnnotationSession } from './session';
import type { BrowserAnnotationTargetEvidence } from './types';

function createEvidence(locator = '#target'): BrowserAnnotationTargetEvidence {
  return {
    fileLabel: 'Target',
    frame: { kind: 'top-document' },
    locator,
    nodePosition: { x: 20, y: 30 },
    pageUrl: 'https://example.test/page',
    targetPath: 'main > button',
    targetRole: 'button',
    targetSelector: 'button#target',
    targetText: 'Target',
    viewport: { height: 720, width: 1280 },
  };
}

describe('browser annotation session', () => {
  it('groups text, property, and comment changes by target', () => {
    const session = createBrowserAnnotationSession();
    const evidence = createEvidence();

    session.recordTextChange({
      after: 'New label',
      before: 'Old label',
      evidence,
      targetKey: evidence.locator,
    });
    session.recordPropertyChange({
      after: '24px',
      before: '16px',
      evidence,
      order: 2,
      property: 'font-size',
      targetKey: evidence.locator,
    });
    expect(
      session.setComment({ comment: 'Make this prominent', evidence, targetKey: evidence.locator })
    ).toBe(1);

    expect(session.captureSnapshot().domRecords).toEqual([
      expect.objectContaining({
        annotationId: 1,
        comment: 'Make this prominent',
        commentMarker: 1,
        creationOrder: 1,
        propertyChanges: [{ after: '24px', before: '16px', order: 2, property: 'font-size' }],
        targetKey: '#target',
        textChange: { after: 'New label', before: 'Old label' },
      }),
    ]);
  });

  it('keeps original baselines and removes changes that return to them', () => {
    const session = createBrowserAnnotationSession();
    const evidence = createEvidence();

    session.recordPropertyChange({
      after: '18px',
      before: '16px',
      evidence,
      order: 1,
      property: 'font-size',
      targetKey: evidence.locator,
    });
    session.recordPropertyChange({
      after: '20px',
      before: '18px',
      evidence,
      order: 1,
      property: 'font-size',
      targetKey: evidence.locator,
    });

    expect(session.captureSnapshot().domRecords[0]?.propertyChanges[0]).toEqual({
      after: '20px',
      before: '16px',
      order: 1,
      property: 'font-size',
    });

    session.recordPropertyChange({
      after: '16px',
      before: '20px',
      evidence,
      order: 1,
      property: 'font-size',
      targetKey: evidence.locator,
    });
    expect(session.captureSnapshot().domRecords).toEqual([]);
  });

  it('uses independent stable annotation and comment-marker sequences', () => {
    const session = createBrowserAnnotationSession();
    const first = createEvidence('#first');
    const second = createEvidence('#second');

    session.recordTextChange({
      after: 'After',
      before: 'Before',
      evidence: first,
      targetKey: first.locator,
    });
    expect(
      session.setComment({ comment: 'Second', evidence: second, targetKey: second.locator })
    ).toBe(1);
    expect(
      session.setComment({ comment: '', evidence: second, targetKey: second.locator })
    ).toBeNull();
    expect(
      session.setComment({ comment: 'Second again', evidence: second, targetKey: second.locator })
    ).toBe(2);

    expect(session.captureSnapshot().domRecords).toEqual([
      expect.objectContaining({ annotationId: 1, targetKey: '#first' }),
      expect.objectContaining({ annotationId: 3, commentMarker: 2, targetKey: '#second' }),
    ]);
  });

  it('restores snapshots without reusing historical identifiers', () => {
    const session = createBrowserAnnotationSession();
    const first = createEvidence('#first');
    const second = createEvidence('#second');

    session.setComment({ comment: 'First', evidence: first, targetKey: first.locator });
    const beforeSecond = session.captureSnapshot();
    session.setComment({ comment: 'Second', evidence: second, targetKey: second.locator });
    session.applySnapshot(beforeSecond);
    session.setComment({
      comment: 'Second replacement',
      evidence: second,
      targetKey: second.locator,
    });

    expect(session.captureSnapshot().domRecords).toEqual([
      expect.objectContaining({ annotationId: 1, commentMarker: 1 }),
      expect.objectContaining({ annotationId: 3, commentMarker: 3 }),
    ]);
  });

  it('tracks frame creation order and removes missing frames', () => {
    const session = createBrowserAnnotationSession();
    session.syncFrameIds(['frame-1', 'frame-2']);
    session.syncFrameIds(['frame-2', 'frame-3']);

    expect(session.captureSnapshot().frameOrders).toEqual([
      { creationOrder: 2, frameId: 'frame-2' },
      { creationOrder: 3, frameId: 'frame-3' },
    ]);
  });

  it('publishes real mutations and resets the document session', () => {
    const session = createBrowserAnnotationSession();
    const listener = vi.fn();
    const evidence = createEvidence();
    const unsubscribe = session.subscribe(listener);

    session.recordTextChange({
      after: 'Same',
      before: 'Same',
      evidence,
      targetKey: evidence.locator,
    });
    expect(listener).not.toHaveBeenCalled();

    session.setComment({ comment: 'Comment', evidence, targetKey: evidence.locator });
    session.resetForDocument();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(session.captureSnapshot()).toMatchObject({
      domRecords: [],
      frameOrders: [],
      nextAnnotationId: 1,
      nextCommentMarker: 1,
      nextCreationOrder: 1,
    });

    unsubscribe();
  });

  it('commits mutations even when one subscriber fails', () => {
    const session = createBrowserAnnotationSession();
    const evidence = createEvidence();
    const followingListener = vi.fn();
    session.subscribe(() => {
      throw new Error('listener failed');
    });
    session.subscribe(followingListener);

    expect(() =>
      session.setComment({ comment: 'Committed', evidence, targetKey: evidence.locator })
    ).not.toThrow();

    expect(followingListener).toHaveBeenCalledTimes(1);
    expect(session.captureSnapshot().domRecords).toEqual([
      expect.objectContaining({ comment: 'Committed', targetKey: evidence.locator }),
    ]);
  });

  it('owns cloned evidence across record creation and updates', () => {
    const session = createBrowserAnnotationSession();
    const firstEvidence: BrowserAnnotationTargetEvidence = {
      ...createEvidence(),
      frame: { kind: 'iframe', name: 'Initial frame', selector: '#initial-frame' },
    };
    session.setComment({
      comment: 'Initial',
      evidence: firstEvidence,
      targetKey: firstEvidence.locator,
    });
    firstEvidence.pageUrl = 'https://mutated.test/creation';
    firstEvidence.nodePosition.x = 900;
    firstEvidence.viewport.width = 320;
    if (firstEvidence.frame.kind === 'iframe') {
      firstEvidence.frame.name = 'Mutated initial frame';
    }

    const updatedEvidence: BrowserAnnotationTargetEvidence = {
      ...createEvidence(),
      frame: { kind: 'iframe', name: 'Updated frame', selector: '#updated-frame' },
      pageUrl: 'https://example.test/updated',
    };
    session.setComment({
      comment: 'Updated',
      evidence: updatedEvidence,
      targetKey: updatedEvidence.locator,
    });
    const revision = session.getState().revision;
    updatedEvidence.pageUrl = 'https://mutated.test/update';
    updatedEvidence.nodePosition.x = 901;
    updatedEvidence.viewport.width = 321;
    if (updatedEvidence.frame.kind === 'iframe') {
      updatedEvidence.frame.name = 'Mutated updated frame';
    }

    expect(session.getState().revision).toBe(revision);
    expect(session.captureSnapshot().domRecords[0]?.evidence).toMatchObject({
      frame: { kind: 'iframe', name: 'Updated frame', selector: '#updated-frame' },
      nodePosition: { x: 20, y: 30 },
      pageUrl: 'https://example.test/updated',
      viewport: { height: 720, width: 1280 },
    });
  });
});
