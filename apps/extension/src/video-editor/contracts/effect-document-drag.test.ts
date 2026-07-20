import { expect, it } from 'vitest';

import {
  readVideoEditorEffectDocumentDragPayload,
  type VideoEditorEffectDocumentDataTransfer,
  VIDEO_EDITOR_EFFECT_DOCUMENT_DRAG_MIME,
  writeVideoEditorEffectDocumentDragPayload,
} from './effect-document-drag';

it('round-trips the exact bounded effect document drag contract', () => {
  const dataTransfer = createDataTransfer();
  const payload = {
    documentId: 'document.transition',
    kind: 'transition' as const,
    packId: 'pack.effects',
  };

  writeVideoEditorEffectDocumentDragPayload(dataTransfer, payload);

  expect(dataTransfer.effectAllowed).toBe('copy');
  expect(readVideoEditorEffectDocumentDragPayload(dataTransfer)).toEqual(payload);
});

it.each([
  '',
  '{',
  '[]',
  JSON.stringify({ documentId: 'document', kind: 'unknown', packId: 'pack' }),
  JSON.stringify({ documentId: 'document', extra: true, kind: 'transition', packId: 'pack' }),
  JSON.stringify({ documentId: 'x'.repeat(257), kind: 'transition', packId: 'pack' }),
  ' '.repeat(1_025),
])('rejects malformed or expanded drag payload %j', (source) => {
  const dataTransfer = createDataTransfer();
  dataTransfer.setData(VIDEO_EDITOR_EFFECT_DOCUMENT_DRAG_MIME, source);

  expect(readVideoEditorEffectDocumentDragPayload(dataTransfer)).toBeNull();
});

function createDataTransfer(): VideoEditorEffectDocumentDataTransfer {
  const values = new Map<string, string>();
  return {
    dropEffect: 'none',
    effectAllowed: 'uninitialized',
    getData: (type: string) => values.get(type) ?? '',
    setData: (type: string, value: string) => {
      values.set(type, value);
    },
    get types() {
      return [...values.keys()];
    },
  };
}
