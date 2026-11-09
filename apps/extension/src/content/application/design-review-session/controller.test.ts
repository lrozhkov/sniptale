import { expect, it } from 'vitest';
import { ReviewSessionDocumentController } from './controller';
import type {
  BrowserDomAnnotationRecord,
  BrowserAnnotationSessionSnapshot,
} from '../../parser/page-preparation/annotations';

const pageA = 'https://example.test/a';
const pageB = 'https://example.test/b';
function record(pageUrl = pageA, comment = 'Accepted feedback'): BrowserDomAnnotationRecord {
  return {
    annotationId: 1,
    creationOrder: 1,
    comment,
    propertyChanges: [],
    evidence: {
      fileLabel: 'browser:button',
      frame: { kind: 'top-document' },
      locator: '#target',
      nodePosition: { x: 10, y: 20 },
      pageUrl,
      targetPath: 'button#target',
      targetSelector: 'button#target',
      targetText: 'Continue',
      viewport: { width: 1280, height: 560 },
    },
  };
}
function snapshot(records: BrowserDomAnnotationRecord[]): BrowserAnnotationSessionSnapshot {
  return {
    schemaVersion: 1,
    domRecords: records,
    frameOrders: [],
    nextAnnotationId: 2,
    nextCreationOrder: 2,
    nextMarkerNumber: 2,
  };
}
const preview = { dataUrl: 'data:image/png;base64,YQ==', width: 100, height: 50 };

it('retains unavailable records across navigation', () => {
  const controller = new ReviewSessionDocumentController();
  controller.sync(pageA, snapshot([record()]));
  const accepted = structuredClone(controller.document.entries[0]);
  controller.sync(pageB, snapshot([]));
  expect(controller.document.entries).toEqual([accepted]);
  controller.sync(pageB, snapshot([record(pageB, 'Other page')]));
  expect(controller.document.entries.map((entry) => entry.record.comment)).toEqual([
    'Accepted feedback',
    'Other page',
  ]);
  expect(new Set(controller.document.entries.map((entry) => entry.id)).size).toBe(2);
});

it('does not restore deleted records after delayed capture', () => {
  const controller = new ReviewSessionDocumentController();
  controller.sync(pageA, snapshot([record()]));
  const entry = controller.document.entries[0]!;
  const signature = JSON.stringify(entry.record);
  controller.remove(entry.id);
  expect(controller.setPreview(entry.id, signature, preview)).toBe(false);
  expect(controller.snapshot().snapshot.domRecords).toEqual([]);
  controller.undo();
  expect(controller.document.entries).toEqual([entry]);
});

it('isolates immutable aggregate records and previews from the session', () => {
  const controller = new ReviewSessionDocumentController();
  controller.sync(pageA, snapshot([record()]));
  const entry = controller.document.entries[0]!;
  controller.setPreview(entry.id, JSON.stringify(entry.record), preview);
  controller.sync(pageB, snapshot([record(pageB)]));
  const exported = controller.snapshot();
  expect(exported.snapshot.domRecords.map((item) => item.annotationId)).toEqual([1, 2]);
  expect(exported.previews.get(1)).toEqual(preview);
  exported.snapshot.domRecords[0]!.comment = 'Changed export';
  exported.previews.get(1)!.dataUrl = 'data:image/png;base64,Yg==';
  expect(controller.document.entries[0]!.record.comment).toBe('Accepted feedback');
  expect(controller.document.entries[0]!.preview!.dataUrl).toBe('data:image/png;base64,YQ==');
});

it('rejects delayed previews for an older feedback signature and preserves the last accepted preview', () => {
  const controller = new ReviewSessionDocumentController();
  controller.sync(pageA, snapshot([record()]));
  const entry = controller.document.entries[0]!;
  const oldSignature = JSON.stringify(entry.record);
  expect(controller.setPreview(entry.id, oldSignature, preview)).toBe(true);
  controller.sync(pageA, snapshot([record(pageA, 'Updated feedback')]));
  const latePreview = { ...preview, dataUrl: 'data:image/png;base64,Yg==' };
  expect(controller.setPreview(entry.id, oldSignature, latePreview)).toBe(false);
  expect(controller.document.entries[0]!.preview).toEqual(preview);
  expect(
    controller.setPreview(
      entry.id,
      JSON.stringify(controller.document.entries[0]!.record),
      latePreview
    )
  ).toBe(true);
  expect(controller.snapshot().previews.get(1)).toEqual(latePreview);
});

it('excludes pure text changes from review entries while preserving text evidence on reviewed records', () => {
  const controller = new ReviewSessionDocumentController();
  const textChange = { before: 'Original', after: 'Edited' };
  controller.sync(pageA, snapshot([{ ...record(pageA, ''), textChange }]));
  expect(controller.document.entries).toEqual([]);
  controller.sync(pageA, snapshot([{ ...record(), textChange }]));
  const restored = new ReviewSessionDocumentController();
  expect(restored.restore(JSON.stringify(controller.document))).toBe(true);
  expect(restored.snapshot().snapshot.domRecords[0]).toMatchObject({
    comment: 'Accepted feedback',
    textChange,
  });
});

it('preserves absent current-page feedback unless its annotation ID was explicitly removed', () => {
  const controller = new ReviewSessionDocumentController();
  controller.sync(pageA, snapshot([record()]));
  const accepted = structuredClone(controller.document.entries);
  expect(controller.sync(pageA, snapshot([]))).toBe(false);
  expect(controller.document.entries).toEqual(accepted);
  expect(controller.sync(pageA, snapshot([]), new Set([1]))).toBe(true);
  expect(controller.document.entries).toEqual([]);
});
