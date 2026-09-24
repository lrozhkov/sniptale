import { expect, it } from 'vitest';

import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { createMockDocument } from '../instance/bindings/test-fixtures-document';
import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../../features/highlighter/frame-annotation/defaults';
import {
  createFrameAnnotationProxy,
  commitFrameAnnotationProxy,
  readFrameAnnotationSnapshot,
} from '../../frame-annotation/proxy';
import { assertValidFrameAnnotationsInCanvasJson } from '../../frame-annotation/import-boundary';
import { serializeCanvasObjects } from '../document/serialization';
import {
  createEditorSnapshotHistory,
  pushEditorSnapshotHistory,
  redoEditorSnapshot,
  undoEditorSnapshot,
} from './';

it('round-trips editor documents through snapshot history', () => {
  const first = createMockDocument();
  const second = {
    ...createMockDocument(),
    sourceName: 'second.png',
  };
  const history = createEditorSnapshotHistory(first);

  expect(pushEditorSnapshotHistory({ exportDocument: () => second, history, muted: false })).toBe(
    true
  );
  expect(undoEditorSnapshot(history)).toEqual(first);
  expect(redoEditorSnapshot(history)).toEqual(second);
});

it('rejects malformed or invalid editor document snapshots', () => {
  const malformedHistory = new SnapshotHistory<string>('not-json');
  malformedHistory.push(JSON.stringify(createMockDocument()));
  expect(undoEditorSnapshot(malformedHistory)).toBeNull();
  expect(malformedHistory.getState().index).toBe(1);

  const invalidShapeHistory = new SnapshotHistory<string>(JSON.stringify({ version: 1 }));
  invalidShapeHistory.push(JSON.stringify(createMockDocument()));
  expect(undoEditorSnapshot(invalidShapeHistory)).toBeNull();
  expect(invalidShapeHistory.getState().index).toBe(1);

  const invalidRedoHistory = new SnapshotHistory<string>(JSON.stringify(createMockDocument()));
  invalidRedoHistory.push('not-json');
  invalidRedoHistory.undo();
  expect(redoEditorSnapshot(invalidRedoHistory)).toBeNull();
  expect(invalidRedoHistory.getState().index).toBe(0);
});

it('round-trips frame comments and step numbers through editor history', () => {
  const callout = createDefaultFrameCallout();
  callout.content.bodyHtml = '<p>Before</p>';
  const proxy = createFrameAnnotationProxy({
    frame: {
      id: 'frame-1',
      x: 20,
      y: 30,
      width: 100,
      height: 80,
      callout,
      stepBadge: { ...createDefaultFrameStepBadge(), auto: false, value: '4' },
    },
    label: 'Frame 1',
    ordering: 0,
  });
  const exportDocument = () => ({
    ...createMockDocument(),
    canvasJson: serializeCanvasObjects({ getObjects: () => [proxy] } as never),
  });
  const history = createEditorSnapshotHistory(exportDocument());
  const changed = readFrameAnnotationSnapshot(proxy)!;
  commitFrameAnnotationProxy(proxy, {
    ...changed,
    callout: {
      ...changed.callout!,
      content: { ...changed.callout!.content, bodyHtml: '<p>After</p>' },
    },
    stepBadge: { ...changed.stepBadge!, value: '5' },
  });
  pushEditorSnapshotHistory({ exportDocument, history, muted: false });

  const before = undoEditorSnapshot(history)!;
  const after = redoEditorSnapshot(history)!;
  for (const document of [before, after]) {
    expect(() => assertValidFrameAnnotationsInCanvasJson(document.canvasJson)).not.toThrow();
  }
  const readSnapshot = (canvasJson: string) => {
    const parsed = JSON.parse(canvasJson) as {
      objects: Array<{ sniptaleFrameAnnotationJson: string }>;
    };
    return JSON.parse(parsed.objects[0]!.sniptaleFrameAnnotationJson) as {
      callout: { content: { bodyHtml: string } };
      stepBadge: { value: string };
    };
  };
  expect(readSnapshot(before.canvasJson)).toMatchObject({
    callout: { content: { bodyHtml: '<p>Before</p>' } },
    stepBadge: { value: '4' },
  });
  expect(readSnapshot(after.canvasJson)).toMatchObject({
    callout: { content: { bodyHtml: '<p>After</p>' } },
    stepBadge: { value: '5' },
  });
});
