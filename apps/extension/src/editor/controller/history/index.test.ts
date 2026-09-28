import { expect, it, vi } from 'vitest';

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
  resetEditorSnapshotHistory,
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

it('undoes and redoes edits to a hydrated document with a runtime blob source', () => {
  const first = { ...createMockDocument(), sourceImageData: 'blob:hydrated-source' };
  const second = { ...first, canvasJson: '{"version":"7.2.0","objects":[{"type":"rect"}]}' };
  const history = createEditorSnapshotHistory(first);
  pushEditorSnapshotHistory({ exportDocument: () => second, history, muted: false });

  expect(undoEditorSnapshot(history)).toEqual(first);
  expect(redoEditorSnapshot(history)).toEqual(second);
});

it('stores repeated raster data once while keeping resize undo and redo loadable', () => {
  const source = `data:image/png;base64,${'A'.repeat(12_000)}`;
  const resized = `data:image/png;base64,${'B'.repeat(12_000)}`;
  const first = {
    ...createMockDocument(),
    sourceImageData: source,
    canvasJson: JSON.stringify({ objects: [{ src: source, type: 'image' }] }),
  };
  const history = createEditorSnapshotHistory(first);
  for (let index = 0; index < 50; index += 1) {
    pushEditorSnapshotHistory({
      exportDocument: () => ({ ...first, sourceName: `edit-${index}` }),
      history,
      muted: false,
    });
    expect(history.getCurrent().length).toBeLessThan(1_000);
  }
  pushEditorSnapshotHistory({
    exportDocument: () => ({ ...first, sourceImageData: resized, sourceName: 'resized' }),
    history,
    muted: false,
  });

  expect(history.getCurrent().length).toBeLessThan(1_000);
  expect(undoEditorSnapshot(history)?.sourceImageData).toBe(source);
  expect(JSON.parse(undoEditorSnapshot(history)!.canvasJson).objects[0].src).toBe(source);
  expect(redoEditorSnapshot(history)?.sourceImageData).toBe(source);
  expect(redoEditorSnapshot(history)?.sourceImageData).toBe(resized);
});

it('restores only image fields without reviver traversal of the full snapshot', () => {
  const image = `data:image/png;base64,${'A'.repeat(6_000)}`;
  const background = `data:image/png;base64,${'B'.repeat(6_000)}`;
  const favicon = `data:image/png;base64,${'C'.repeat(6_000)}`;
  const first = {
    ...createMockDocument(),
    sourceImageData: image,
    sourceName: 'sniptale-history-asset:0',
    frame: { ...createMockDocument().frame, backgroundImageData: background },
    browserFrame: {
      title: 'Example',
      url: 'https://example.com',
      faviconDataUrl: favicon,
      canvasMode: 'resize' as const,
      contentMode: 'push-down' as const,
    },
    canvasJson: JSON.stringify({
      objects: [
        { src: image, type: 'image' },
        { text: 'sniptale-history-asset:0', type: 'textbox' },
      ],
    }),
  };
  const history = createEditorSnapshotHistory(first);
  pushEditorSnapshotHistory({
    exportDocument: () => ({ ...first, sourceName: 'edited' }),
    history,
    muted: false,
  });

  const parse = vi.spyOn(JSON, 'parse');
  try {
    expect(undoEditorSnapshot(history)).toEqual(first);
    expect(parse.mock.calls.filter(([, reviver]) => typeof reviver === 'function')).toHaveLength(0);
  } finally {
    parse.mockRestore();
  }
});

it('releases binary references after their snapshots leave the bounded history', () => {
  const source = (index: number) => `data:image/png;base64,${String(index).padStart(5_000, 'A')}`;
  const first = { ...createMockDocument(), sourceImageData: source(0) };
  const history = createEditorSnapshotHistory(first);

  for (let index = 1; index <= 80; index += 1) {
    pushEditorSnapshotHistory({
      exportDocument: () => ({ ...first, sourceImageData: source(index) }),
      history,
      muted: false,
    });
  }
  pushEditorSnapshotHistory({ exportDocument: () => first, history, muted: false });

  expect(history.getSnapshots()).toHaveLength(80);
  expect(history.getCurrent()).toContain('sniptale-history-asset:81');
  expect(undoEditorSnapshot(history)?.sourceImageData).toBe(source(80));
  expect(redoEditorSnapshot(history)?.sourceImageData).toBe(source(0));
});

it('does not reparse retained snapshots when committing into a full history', () => {
  const first = createMockDocument();
  const history = createEditorSnapshotHistory(first);
  for (let index = 1; index < 80; index += 1) {
    pushEditorSnapshotHistory({
      exportDocument: () => ({ ...first, sourceName: `edit-${index}` }),
      history,
      muted: false,
    });
  }

  const parse = vi.spyOn(JSON, 'parse');
  try {
    pushEditorSnapshotHistory({
      exportDocument: () => ({ ...first, sourceName: 'latest' }),
      history,
      muted: false,
    });
    expect(parse.mock.calls.length).toBeLessThan(5);
  } finally {
    parse.mockRestore();
  }
});

it('releases image data from a discarded redo branch', () => {
  const source = (value: string) => `data:image/png;base64,${value.repeat(5_000)}`;
  const first = { ...createMockDocument(), sourceImageData: source('A') };
  const history = createEditorSnapshotHistory(first);
  for (const value of ['B', 'C']) {
    pushEditorSnapshotHistory({
      exportDocument: () => ({ ...first, sourceImageData: source(value) }),
      history,
      muted: false,
    });
  }

  expect(undoEditorSnapshot(history)?.sourceImageData).toBe(source('B'));
  pushEditorSnapshotHistory({
    exportDocument: () => ({ ...first, sourceImageData: source('D') }),
    history,
    muted: false,
  });
  expect(redoEditorSnapshot(history)).toBeNull();
  pushEditorSnapshotHistory({
    exportDocument: () => ({ ...first, sourceImageData: source('C') }),
    history,
    muted: false,
  });

  expect(history.getCurrent()).toContain('sniptale-history-asset:4');
  expect(undoEditorSnapshot(history)?.sourceImageData).toBe(source('D'));
  expect(redoEditorSnapshot(history)?.sourceImageData).toBe(source('C'));
});

it('drops previous image bytes when restoring the original resets history', () => {
  const source = `data:image/png;base64,${'A'.repeat(5_000)}`;
  const original = `data:image/png;base64,${'B'.repeat(5_000)}`;
  const first = { ...createMockDocument(), sourceImageData: source };
  const history = createEditorSnapshotHistory(first);

  resetEditorSnapshotHistory(history, { ...first, sourceImageData: original });
  pushEditorSnapshotHistory({ exportDocument: () => first, history, muted: false });

  expect(history.getCurrent()).toContain('sniptale-history-asset:2');
  expect(undoEditorSnapshot(history)?.sourceImageData).toBe(original);
  expect(redoEditorSnapshot(history)?.sourceImageData).toBe(source);
});

it('does not retain expired image bytes for a filename resembling a history token', () => {
  const oldSource = `data:image/png;base64,${'A'.repeat(5_000)}`;
  const newSource = `data:image/png;base64,${'B'.repeat(5_000)}`;
  const first = { ...createMockDocument(), sourceImageData: oldSource };
  const history = createEditorSnapshotHistory(first);

  resetEditorSnapshotHistory(history, {
    ...first,
    sourceImageData: newSource,
    sourceName: 'sniptale-history-asset:0',
  });
  pushEditorSnapshotHistory({ exportDocument: () => first, history, muted: false });

  expect(history.getCurrent()).toContain('sniptale-history-asset:2');
  expect(undoEditorSnapshot(history)?.sourceName).toBe('sniptale-history-asset:0');
  expect(redoEditorSnapshot(history)?.sourceImageData).toBe(oldSource);
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

  const remoteSourceHistory = new SnapshotHistory<string>(
    JSON.stringify({ ...createMockDocument(), sourceImageData: 'https://example.com/image.png' })
  );
  remoteSourceHistory.push(JSON.stringify(createMockDocument()));
  expect(undoEditorSnapshot(remoteSourceHistory)).toBeNull();
  expect(remoteSourceHistory.getState().index).toBe(1);

  const invalidCanvasHistory = createEditorSnapshotHistory(createMockDocument());
  invalidCanvasHistory.reset(JSON.stringify({ ...createMockDocument(), canvasJson: '{invalid' }));
  pushEditorSnapshotHistory({
    exportDocument: () => createMockDocument(),
    history: invalidCanvasHistory,
    muted: false,
  });
  expect(undoEditorSnapshot(invalidCanvasHistory)).toBeNull();
  expect(invalidCanvasHistory.getState().index).toBe(1);
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
