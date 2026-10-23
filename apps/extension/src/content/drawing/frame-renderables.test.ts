import { expect, it } from 'vitest';
import {
  createDrawingSession,
  type DrawingDocumentCommit,
  type DrawingObject,
} from '../../features/drawing/public';
import { resolveDrawingVisualLayers } from './frame-renderables';

const pencil: DrawingObject = {
  id: 'pencil',
  kind: 'pencil',
  color: '#f00',
  width: 4,
  samples: [
    { x: 10, y: 20, t: 0 },
    { x: 100, y: 20, t: 10 },
  ],
};
const text: Extract<DrawingObject, { kind: 'text' }> = {
  id: 'text',
  kind: 'text',
  text: 'Text',
  color: '#000',
  backgroundColor: null,
  fontSize: 20,
  bounds: { x: 10, y: 10, width: 80, height: 30 },
};

function order(objects: readonly DrawingObject[]) {
  return resolveDrawingVisualLayers(objects, null).flatMap((layer) =>
    layer.kind === 'ink' ? layer.objects.map((object) => object.id) : [layer.object.id]
  );
}

it('preserves interleaved ink, DOM text, and blur instead of grouping by object type', () => {
  const blur: DrawingObject = { id: 'blur', kind: 'blur', bounds: text.bounds };
  const objects = [pencil, text, { ...pencil, id: 'top' }, blur, { ...text, id: 'label' }];
  expect(order(objects)).toEqual(objects.map((object) => object.id));
  expect(resolveDrawingVisualLayers(objects, null).map((layer) => layer.kind)).toEqual([
    'ink',
    'text',
    'ink',
    'blur',
    'text',
  ]);
});

it('derives reordering and undo from the document without a second visual order', () => {
  const commits: DrawingDocumentCommit[] = [];
  const session = createDrawingSession({
    onDocumentCommit: (commit) => {
      commits.push(commit);
      return true;
    },
  });
  session.commitObject(pencil);
  session.commitObject(text);
  session.select(text.id);
  expect(order(session.getSnapshot().document.objects)).toEqual(['pencil', 'text']);
  session.moveSelected('back');
  expect(order(session.getSnapshot().document.objects)).toEqual(['text', 'pencil']);
  const reorder = commits.at(-1)!;
  reorder.replay(reorder.before);
  expect(order(session.getSnapshot().document.objects)).toEqual(['pencil', 'text']);
  session.dispose();
});

it('keeps a live ink draft above existing text and replaces moved objects in place', () => {
  const draft = { ...pencil, id: 'draft' };
  const layers = resolveDrawingVisualLayers([pencil, text], {
    kind: 'create',
    object: draft,
    start: { x: 10, y: 20 },
    arrowFromTip: false,
  });
  expect(layers.at(-1)).toEqual({ kind: 'ink', objects: [draft] });
});
