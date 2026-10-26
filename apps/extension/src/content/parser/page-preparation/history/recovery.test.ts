// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { createPagePreparationHistoryStore } from './store';
import { createDomMutationPatch } from './dom';
import {
  createRecoveryLocator,
  resolveRecoveryLocator,
  portableSessionSnapshot,
} from './recovery-locators';
import { createPagePreparationDrawingSession } from '../../../drawing/history';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import type { PagePreparationSessionSnapshot } from './types';
import {
  applyPageStyleMutation,
  createPageStyleHistoryEffect,
  createRecoveredPageStyleHistoryEffect,
} from '../../../selection/design-review/style/mutation';

function snapshot(): PagePreparationSessionSnapshot {
  return {
    annotations: {
      domRecords: [],
      frameOrders: [],
      nextAnnotationId: 1,
      nextCreationOrder: 1,
      nextMarkerNumber: 1,
      schemaVersion: 1,
    },
    frameSession: {
      frames: [],
      globalEffectMode: 'border',
      globalStepBadgeSettings: { autoMode: true },
      sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
      sessionBorderPreset: DEFAULT_BORDER_PRESET,
      sessionCalloutStyle: null,
      sessionFocusSettings: { opacity: 0.5, showBorder: false },
      sessionStepBadgeTemplate: null,
      stepBadgeOrder: [],
    },
  };
}
function session() {
  const history = createPagePreparationHistoryStore();
  let current = snapshot();
  history.registerBridge({
    createRecoveryStyleEffect: (selector, value) => {
      const target = resolveRecoveryLocator(selector);
      const view = target?.ownerDocument.defaultView;
      return view && (target instanceof view.HTMLElement || target instanceof view.SVGElement)
        ? createRecoveredPageStyleHistoryEffect(target, value)
        : null;
    },
    captureSnapshot: () => structuredClone(current),
    applySnapshot: (next) => {
      current = structuredClone(next);
    },
  });
  const drawing = createPagePreparationDrawingSession(history);
  return {
    history,
    drawing,
    read: () => current,
    change: (next: PagePreparationSessionSnapshot) => {
      current = next;
    },
  };
}
afterEach(() => {
  document.body.replaceChildren();
});

function commitStyle(
  source: ReturnType<typeof session>,
  target: HTMLElement,
  property: 'color' | 'translate',
  value: string
) {
  Object.defineProperty(target, 'getClientRects', {
    configurable: true,
    value: () => [DOMRect.fromRect({ width: 100, height: 40 })],
  });
  const result = applyPageStyleMutation({ target, declarations: [{ property, value }] });
  if (result.status !== 'applied') throw new Error('Expected style mutation');
  source.history.commitEntry({
    scope: 'design-review',
    domEffect: createPageStyleHistoryEffect(result.batch),
  });
}

it('restores ordered style and Move declarations with exact priorities and domain Undo/Redo', () => {
  document.body.innerHTML = '<p style="color:red!important">Original</p>';
  const source = session();
  const target = document.querySelector('p')!;
  commitStyle(source, target, 'color', 'blue');
  commitStyle(source, target, 'color', 'green');
  commitStyle(source, target, 'translate', '12px 18px');
  const packet = source.history.captureRecovery()!;
  expect(packet.entries.map((entry) => entry.style?.declarations[0]?.after.value)).toEqual([
    'blue',
    'green',
    '12px 18px',
  ]);
  source.history.clear();
  source.drawing.dispose();
  document.body.innerHTML = '<p style="color:red!important; padding:4px">Original</p>';
  const destination = session();
  const restored = document.querySelector('p')!;
  expect(destination.history.restoreRecovery(packet)).toBe(true);
  expect(restored.style.color).toBe('green');
  expect(restored.style.translate).toBe('12px 18px');
  destination.history.undo('page-editing');
  expect(restored.style.translate).toBe('');
  destination.history.undo('page-editing');
  expect(restored.style.color).toBe('blue');
  destination.history.undo('page-editing');
  expect(restored.style.getPropertyPriority('color')).toBe('important');
  expect(restored.style.color).toBe('red');
  expect(restored.style.padding).toBe('4px');
  destination.history.redo('page-editing');
  expect(restored.style.color).toBe('blue');
  destination.history.clear();
  destination.drawing.dispose();
});

it('compensates earlier text when a style source changed and retries the unchanged packet', () => {
  document.body.innerHTML = '<p>Original</p><aside style="color:red">Note</aside>';
  const source = session();
  const target = document.querySelector('p')!;
  const patch = createDomMutationPatch(target);
  target.textContent = 'Edited';
  patch.after = { ...patch.before, html: 'Edited' };
  source.history.commitEntry({ scope: 'content-editing', domBatch: { patches: [patch] } });
  commitStyle(source, document.querySelector('aside')!, 'color', 'blue');
  const packet = source.history.captureRecovery()!;
  const encoded = JSON.stringify(packet);
  source.history.clear();
  source.drawing.dispose();
  document.body.innerHTML = '<p>Original</p><aside style="color:purple">Note</aside>';
  const destination = session();
  expect(destination.history.restoreRecovery(packet)).toBe(false);
  expect(document.querySelector('p')?.textContent).toBe('Original');
  expect(document.querySelector('aside')?.style.color).toBe('purple');
  expect(destination.history.getState().canUndo).toBe(false);
  document.querySelector('aside')!.style.color = 'red';
  expect(destination.history.restoreRecovery(packet)).toBe(true);
  expect(JSON.stringify(packet)).toBe(encoded);
  expect(document.querySelector('p')?.textContent).toBe('Edited');
  expect(document.querySelector('aside')?.style.color).toBe('blue');
  destination.history.clear();
  destination.drawing.dispose();
});

it('restores marker-only history before a later rewrite and retains stale ranges until Undo', () => {
  document.body.innerHTML = '<p id="target">Original</p>';
  const source = session();
  const before = source.read();
  const marked = structuredClone(before);
  const marker = { id: 'marker', source: 'Original', start: 0, end: 4, color: '#ffcc00' };
  marked.annotations.domRecords = [
    {
      annotationId: 1,
      creationOrder: 1,
      propertyChanges: [],
      textMarkers: [marker],
      evidence: {
        fileLabel: 'p',
        frame: { kind: 'top-document' },
        locator: '#target',
        nodePosition: { x: 0, y: 0 },
        pageUrl: 'https://example.test',
        targetPath: 'p',
        targetSelector: '#target',
        targetText: 'Original',
        viewport: { width: 1280, height: 560 },
      },
    },
  ];
  marked.annotations.nextAnnotationId = 2;
  marked.annotations.nextCreationOrder = 2;
  source.change(marked);
  source.history.commitEntry({ scope: 'content-editing', before, after: marked });
  const target = document.querySelector('p')!;
  const patch = createDomMutationPatch(target);
  target.textContent = 'Rewritten';
  patch.after = { ...patch.before, html: 'Rewritten' };
  const rewritten = structuredClone(marked);
  rewritten.annotations.domRecords[0]!.textChange = { before: 'Original', after: 'Rewritten' };
  source.change(rewritten);
  source.history.commitEntry({
    scope: 'content-editing',
    before: marked,
    after: rewritten,
    domBatch: { patches: [patch] },
  });
  const packet = source.history.captureRecovery()!;
  source.history.clear();
  source.drawing.dispose();
  document.body.innerHTML = '<p id="target">Original</p>';
  const destination = session();
  expect(destination.history.restoreRecovery(packet)).toBe(true);
  expect(document.querySelector('p')?.textContent).toBe('Rewritten');
  expect(destination.read().annotations.domRecords[0]?.textMarkers).toEqual([marker]);
  destination.history.undo('page-editing');
  expect(document.querySelector('p')?.textContent).toBe('Original');
  expect(destination.read().annotations.domRecords[0]?.textMarkers).toEqual([marker]);
  destination.history.undo('page-editing');
  expect(destination.read().annotations.domRecords).toEqual([]);
  destination.history.redo('page-editing');
  expect(destination.read().annotations.domRecords[0]?.textMarkers).toEqual([marker]);
  destination.history.clear();
  destination.drawing.dispose();
});
it('restores text and drawing into a fresh DOM and preserves domain undo redo and reset', () => {
  document.body.innerHTML = '<main><p>Original <b>rich text</b></p></main>';
  const source = session();
  const target = document.querySelector('p')!;
  const patch = createDomMutationPatch(target);
  target.innerHTML = 'Edited <b>rich text</b>';
  patch.after = { ...patch.before, html: target.innerHTML };
  source.history.commitEntry({ scope: 'content-editing', domBatch: { patches: [patch] } });
  source.drawing.commitObject({
    id: 'stroke',
    kind: 'blur',
    bounds: { x: 10, y: 20, width: 30, height: 40 },
  });
  const packet = source.history.captureRecovery();
  expect(packet).not.toBeNull();
  expect(JSON.stringify(packet)).not.toContain('data-sniptale-id');
  source.history.clear();
  source.drawing.dispose();
  document.body.innerHTML = '<main><p>Original <b>rich text</b></p></main>';
  const restored = session();
  expect(restored.history.restoreRecovery(structuredClone(packet!))).toBe(true);
  expect(document.querySelector('p')?.innerHTML).toBe('Edited <b>rich text</b>');
  expect(restored.drawing.getSnapshot().document.objects).toHaveLength(1);
  expect(restored.history.hasChanges('drawing')).toBe(true);
  restored.history.undo('page-editing');
  expect(document.querySelector('p')?.innerHTML).toBe('Original <b>rich text</b>');
  expect(restored.drawing.getSnapshot().document.objects).toHaveLength(1);
  restored.history.redo('page-editing');
  expect(document.querySelector('p')?.innerHTML).toBe('Edited <b>rich text</b>');
  expect(restored.history.resetScope('drawing')).toBe(true);
  expect(restored.drawing.getSnapshot().document.objects).toHaveLength(0);
  expect(document.querySelector('p')?.innerHTML).toBe('Edited <b>rich text</b>');
  restored.history.clear();
  expect(restored.drawing.getSnapshot().document.objects).toHaveLength(0);
  restored.drawing.dispose();
});
it('refuses missing or changed targets before applying a recoverable set', () => {
  document.body.innerHTML = '<p>Original</p>';
  const source = session();
  const target = document.querySelector('p')!;
  const patch = createDomMutationPatch(target);
  target.textContent = 'Edited';
  patch.after = { ...patch.before, html: target.innerHTML };
  source.history.commitEntry({ scope: 'content-editing', domBatch: { patches: [patch] } });
  const packet = source.history.captureRecovery();
  source.history.clear();
  source.drawing.dispose();
  document.body.innerHTML = '<p>New server content</p>';
  const destination = session();
  expect(destination.history.restoreRecovery(packet!)).toBe(false);
  expect(document.querySelector('p')?.textContent).toBe('New server content');
  expect(destination.history.getState().canUndo).toBe(false);
  document.body.innerHTML = '<div>Different page</div>';
  expect(destination.history.restoreRecovery(packet!)).toBe(false);
  expect(document.body.textContent).toBe('Different page');
  destination.history.clear();
  destination.drawing.dispose();
});

it('restores an edited descendant created by an earlier rich-text edit', () => {
  document.body.innerHTML = '<p>Original</p>';
  const source = session();
  const parent = document.querySelector('p')!;
  const outer = createDomMutationPatch(parent);
  parent.innerHTML = 'Edited <b>new child</b>';
  outer.after = { ...outer.before, html: parent.innerHTML };
  source.history.commitEntry({ scope: 'content-editing', domBatch: { patches: [outer] } });
  const child = parent.querySelector('b')!;
  const inner = createDomMutationPatch(child);
  child.textContent = 'final child';
  inner.after = { ...inner.before, html: child.innerHTML };
  source.history.commitEntry({ scope: 'content-editing', domBatch: { patches: [inner] } });
  const packet = source.history.captureRecovery()!;
  source.history.clear();
  source.drawing.dispose();
  document.body.innerHTML = '<p>Original</p>';
  const destination = session();
  expect(destination.history.restoreRecovery(packet)).toBe(true);
  expect(document.querySelector('p')?.textContent).toBe('Edited final child');
  destination.history.clear();
  destination.drawing.dispose();
});

it('captures the current rich-text result when a later edit replaced an earlier target', () => {
  document.body.innerHTML = '<p>Original <b>child</b></p><aside><b>Unrelated</b></aside>';
  const source = session();
  const parent = document.querySelector('p')!;
  const child = parent.querySelector('b')!;
  const inner = createDomMutationPatch(child);
  child.textContent = 'Edited child';
  inner.after = { ...inner.before, html: child.innerHTML };
  source.history.commitEntry({ scope: 'content-editing', domBatch: { patches: [inner] } });
  const outer = createDomMutationPatch(parent);
  parent.textContent = 'Final paragraph';
  outer.after = { ...outer.before, html: parent.innerHTML };
  source.history.commitEntry({ scope: 'content-editing', domBatch: { patches: [outer] } });
  const packet = source.history.captureRecovery()!;
  source.history.clear();
  source.drawing.dispose();
  document.body.innerHTML = '<p>Original <b>child</b></p><aside><b>Unrelated</b></aside>';
  const destination = session();
  expect(destination.history.restoreRecovery(packet)).toBe(true);
  expect(document.querySelector('p')?.textContent).toBe('Final paragraph');
  expect(document.querySelector('aside')?.textContent).toBe('Unrelated');
  destination.history.clear();
  destination.drawing.dispose();
});

it('restores frame annotations and design notes without crossing their history domains', () => {
  document.body.innerHTML = '<p id="target">Target</p>';
  const source = session();
  const beforeFrame = source.read();
  const withFrame = structuredClone(beforeFrame);
  withFrame.frameSession.frames = [{ id: 'frame-1', x: 10, y: 20, width: 80, height: 40 }];
  source.change(withFrame);
  source.history.commitEntry({ scope: 'annotation', before: beforeFrame, after: withFrame });
  const withNote = structuredClone(withFrame);
  withNote.annotations.domRecords = [
    {
      annotationId: 1,
      creationOrder: 1,
      markerNumber: 1,
      comment: 'Keep this design note',
      designReview: { action: 'refine' },
      propertyChanges: [],
      evidence: {
        fileLabel: 'Target',
        frame: { kind: 'top-document' },
        locator: '#target',
        nodePosition: { x: 0, y: 0 },
        pageUrl: 'https://example.test/page',
        targetPath: 'p#target',
        targetSelector: '#target',
        targetText: 'Target',
        viewport: { width: 1280, height: 560 },
      },
    },
  ];
  withNote.annotations.nextAnnotationId = 2;
  withNote.annotations.nextMarkerNumber = 2;
  source.change(withNote);
  source.history.commitEntry({ scope: 'design-review', before: withFrame, after: withNote });
  const packet = source.history.captureRecovery()!;
  source.history.clear();
  source.drawing.dispose();
  document.body.innerHTML = '<p id="target">Target</p>';
  const destination = session();
  expect(destination.history.restoreRecovery(packet)).toBe(true);
  expect(destination.read().frameSession.frames).toHaveLength(1);
  expect(destination.read().annotations.domRecords[0]?.comment).toBe('Keep this design note');
  destination.history.undo('annotation');
  expect(destination.read().frameSession.frames).toHaveLength(0);
  expect(destination.read().annotations.domRecords[0]?.comment).toBe('Keep this design note');
  destination.history.redo('annotation');
  expect(destination.history.resetScope('design-review')).toBe(true);
  expect(destination.read().annotations.domRecords).toHaveLength(0);
  expect(destination.read().frameSession.frames).toHaveLength(1);
  destination.history.clear();
  destination.drawing.dispose();
});

it('compensates earlier edits after a later owner refuses and permits retry from the retained packet', () => {
  document.body.innerHTML = '<p>Original</p>';
  const source = session();
  const target = document.querySelector('p')!;
  const patch = createDomMutationPatch(target);
  target.textContent = 'Edited';
  patch.after = { ...patch.before, html: target.innerHTML };
  source.history.commitEntry({ scope: 'content-editing', domBatch: { patches: [patch] } });
  source.drawing.commitObject({
    id: 'stroke',
    kind: 'blur',
    bounds: { x: 0, y: 0, width: 20, height: 20 },
  });
  const packet = source.history.captureRecovery()!;
  const originalPacket = JSON.stringify(packet);
  source.history.clear();
  source.drawing.dispose();
  document.body.innerHTML = '<p>Original</p>';
  const destination = session();
  let permitted = false;
  const stop = destination.history.registerDrawingRecovery(
    (document) => permitted && destination.drawing.restoreDocument(document),
    () => destination.drawing.getSnapshot().document.objects.length > 0,
    () => destination.drawing.getCommittedDocument()
  );
  expect(destination.history.restoreRecovery(packet)).toBe(false);
  expect(document.querySelector('p')?.textContent).toBe('Original');
  expect(destination.history.getState().canUndo).toBe(false);
  expect(JSON.stringify(packet)).toBe(originalPacket);
  permitted = true;
  expect(destination.history.restoreRecovery(packet)).toBe(true);
  expect(document.querySelector('p')?.textContent).toBe('Edited');
  expect(destination.drawing.getSnapshot().document.objects).toHaveLength(1);
  stop();
  destination.history.clear();
  destination.drawing.dispose();
});

it('refuses a malformed drawing version and retains the prior page and source document', () => {
  document.body.innerHTML = '<p>Original</p>';
  const source = session();
  source.drawing.commitObject({
    id: 'stroke',
    kind: 'blur',
    bounds: { x: 1, y: 2, width: 20, height: 30 },
  });
  const packet = source.history.captureRecovery()!;
  const drawing = packet.entries.find((entry) => entry.scope === 'drawing')!.drawing!;
  Object.assign(drawing.after.objects[0]!, { bounds: { x: NaN, y: 2, width: 20, height: 30 } });
  expect(source.drawing.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 1 } });
  source.history.clear();
  source.drawing.dispose();
  const destination = session();
  expect(destination.history.restoreRecovery(packet)).toBe(false);
  expect(destination.drawing.getSnapshot().document.objects).toHaveLength(0);
  expect(destination.history.getState().canUndo).toBe(false);
  expect(document.querySelector('p')?.textContent).toBe('Original');
  destination.history.clear();
  destination.drawing.dispose();
});

it('retains the current drawing as one restore group without repeating every intermediate version', () => {
  const source = session();
  for (let index = 0; index < 20; index++) {
    source.drawing.commitObject({
      id: `stroke-${index}`,
      kind: 'pencil',
      color: '#ef4444',
      width: 4,
      samples: Array.from({ length: 200 }, (_, sample) => ({
        x: sample,
        y: index * 5,
        t: sample * 4,
      })),
    });
  }
  const current = source.drawing.getSnapshot().document;
  const packet = source.history.captureRecovery()!;
  expect(JSON.stringify(packet).length).toBeLessThanOrEqual(JSON.stringify(current).length * 3);
  source.history.undo('drawing');
  expect(source.drawing.getSnapshot().document.objects).toHaveLength(19);
  source.history.clear();
  source.drawing.dispose();
  const destination = session();
  expect(destination.history.restoreRecovery(packet)).toBe(true);
  expect(destination.drawing.getSnapshot().document).toEqual(current);
  destination.history.undo('drawing');
  expect(destination.drawing.getSnapshot().document.objects).toHaveLength(0);
  destination.history.redo('drawing');
  expect(destination.drawing.getSnapshot().document).toEqual(current);
  destination.history.clear();
  destination.drawing.dispose();
});

it('does not retain an empty drawing set after its last object has been removed', () => {
  const source = session();
  source.drawing.commitObject({
    id: 'stroke',
    kind: 'blur',
    bounds: { x: 1, y: 2, width: 20, height: 30 },
  });
  source.drawing.clear();
  expect(source.history.captureRecovery()).toBeNull();
  source.history.clear();
  source.drawing.dispose();
});

it('captures the committed drawing at its current page projection without saving a transient preview', () => {
  const source = session();
  source.drawing.dispose();
  const drawing = createPagePreparationDrawingSession(source.history, {
    projection: {
      capture: () => undefined,
      resolve: (object) =>
        object.kind === 'blur'
          ? { ...object, bounds: { ...object.bounds, y: object.bounds.y + 100 } }
          : object,
    },
    dispose: () => undefined,
  });
  drawing.commitObject({
    id: 'stroke',
    kind: 'blur',
    bounds: { x: 1, y: 2, width: 20, height: 30 },
  });
  drawing.previewObjects([
    { id: 'stroke', kind: 'blur', bounds: { x: 99, y: 2, width: 20, height: 30 } },
  ]);
  const packet = source.history.captureRecovery()!;
  expect(
    packet.entries.find((entry) => entry.scope === 'drawing')?.drawing?.after.objects[0]
  ).toMatchObject({ bounds: { x: 1, y: 102 } });
  expect(drawing.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 99, y: 102 } });
  source.history.clear();
  drawing.dispose();
  const destination = session();
  expect(destination.history.restoreRecovery(packet)).toBe(true);
  expect(destination.drawing.getSnapshot().document.objects[0]).toMatchObject({
    bounds: { x: 1, y: 102 },
  });
  destination.history.clear();
  destination.drawing.dispose();
});

it('keeps recovery targets inside the exact nested iframe and open shadow roots', () => {
  const outer = document.createElement('iframe');
  document.body.append(outer);
  const inner = outer.contentDocument!.createElement('iframe');
  outer.contentDocument!.body.append(inner);
  const host = inner.contentDocument!.createElement('section');
  inner.contentDocument!.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  const target = inner.contentDocument!.createElement('p');
  target.textContent = 'Original';
  root.append(target);
  const locator = createRecoveryLocator(target);
  expect(locator.split(' => ')).toHaveLength(3);
  expect(locator).toContain(' >>> ');
  expect(resolveRecoveryLocator(locator)).toBe(target);
  host.remove();
  expect(resolveRecoveryLocator(locator)).toBeNull();
});
it('restores an iframe text edit and keeps undo inside its original document', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const target = iframe.contentDocument!.createElement('p');
  target.textContent = 'Original';
  iframe.contentDocument!.body.append(target);
  const source = session();
  const patch = createDomMutationPatch(target);
  target.textContent = 'Edited';
  patch.after = { ...patch.before, html: 'Edited' };
  source.history.commitEntry({ scope: 'content-editing', domBatch: { patches: [patch] } });
  const packet = source.history.captureRecovery()!;
  source.history.clear();
  source.drawing.dispose();
  target.textContent = 'Original';
  const destination = session();
  expect(destination.history.restoreRecovery(packet)).toBe(true);
  expect(target.textContent).toBe('Edited');
  destination.history.undo('page-editing');
  expect(target.textContent).toBe('Original');
  destination.drawing.dispose();
});
it('does not recover into a matching top document when the saved iframe target is missing', () => {
  const iframe = document.createElement('iframe');
  const unrelated = document.createElement('p');
  unrelated.textContent = 'Original';
  document.body.append(iframe, unrelated);
  const target = iframe.contentDocument!.createElement('p');
  target.textContent = 'Original';
  iframe.contentDocument!.body.append(target);
  const source = session();
  const patch = createDomMutationPatch(target);
  target.textContent = 'Edited';
  patch.after = { ...patch.before, html: 'Edited' };
  source.history.commitEntry({ scope: 'content-editing', domBatch: { patches: [patch] } });
  const packet = source.history.captureRecovery()!;
  source.history.clear();
  source.drawing.dispose();
  target.remove();
  const destination = session();
  expect(destination.history.restoreRecovery(packet)).toBe(false);
  expect(unrelated.textContent).toBe('Original');
  expect(destination.history.hasChanges()).toBe(false);
  destination.drawing.dispose();
});
it('refuses ambiguous or inaccessible recovery paths without searching another scope', () => {
  const first = document.createElement('p');
  const second = document.createElement('p');
  first.className = second.className = 'same';
  document.body.append(first, second);
  expect(resolveRecoveryLocator('.same')).toBeNull();
  expect(resolveRecoveryLocator('[')).toBeNull();
  expect(resolveRecoveryLocator('p:nth-of-type(1) >>> p')).toBeNull();
  expect(resolveRecoveryLocator('p:nth-of-type(1) => p')).toBeNull();
  expect(resolveRecoveryLocator(Array(22).fill('iframe').join(' => '))).toBeNull();
});

it('rejects a later invalid snapshot before the first DOM mutation or history identity allocation', () => {
  document.body.innerHTML = '<p>Original</p>';
  const source = session();
  const target = document.querySelector('p')!;
  const patch = createDomMutationPatch(target);
  target.textContent = 'Edited';
  patch.after = { ...patch.before, html: 'Edited' };
  source.history.commitEntry({ scope: 'content-editing', domBatch: { patches: [patch] } });
  const packet = source.history.captureRecovery()!;
  source.history.clear();
  source.drawing.dispose();
  packet.entries.push({
    ...structuredClone(packet.entries[0]!),
    after: { ...snapshot(), annotations: { ...snapshot().annotations, schemaVersion: 2 as 1 } },
  });
  document.body.innerHTML = '<p>Original</p>';
  const destination = session();
  const observer = new MutationObserver(() => undefined);
  observer.observe(document.body, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
  expect(destination.history.restoreRecovery(packet)).toBe(false);
  expect(observer.takeRecords()).toEqual([]);
  expect(document.querySelector('p')?.textContent).toBe('Original');
  expect(destination.history.restoreRecovery(null)).toBe(false);
  expect(destination.history.restoreRecovery({ version: 1, entries: 'invalid' })).toBe(false);
  observer.disconnect();
  destination.drawing.dispose();
});

it('changes the opaque recovery token only when the canonical applied history changes', () => {
  const source = session();
  const initial = source.history.getRecoveryToken();
  expect(source.history.getRecoveryToken()).toBe(initial);
  source.drawing.commitObject({
    id: 'one',
    kind: 'blur',
    bounds: { x: 1, y: 2, width: 3, height: 4 },
  });
  const committed = source.history.getRecoveryToken();
  expect(committed).not.toBe(initial);
  expect(source.history.getRecoveryToken()).toBe(committed);
  source.history.captureRecovery();
  expect(source.history.getRecoveryToken()).toBe(committed);
  source.history.undo('drawing');
  expect(source.history.getRecoveryToken()).not.toBe(committed);
  source.drawing.dispose();
});

it.each(['connected', 'detached', 'missing'] as const)(
  'transports linked frame and evidence locators for a %s target',
  (kind) => {
    const target = document.createElement('button');
    target.id = 'portable-target';
    if (kind === 'connected') document.body.append(target);
    const value = snapshot();
    value.frameSession.frames = [
      {
        id: 'linked',
        x: 1,
        y: 2,
        width: 30,
        height: 20,
        linkedElementSelector: '#portable-target',
      },
    ];
    value.annotations.frameOrders = [
      {
        frameId: 'linked',
        kind: 'linked',
        linkedElementSelector: '#portable-target',
        pageUrl: 'https://example.test',
        rect: { x: 1, y: 2, width: 30, height: 20 },
        viewport: { width: 1280, height: 560 },
        creationOrder: 1,
        frameName: 'Linked frame',
      },
    ];
    const result = portableSessionSnapshot(
      value,
      {
        captureSnapshot: () => value,
        applySnapshot: () => {},
        resolveRecoveryFrameTarget: () => (kind === 'missing' ? null : target),
      },
      new Map([[target, '#retained-target']])
    );
    const expected =
      kind === 'connected'
        ? createRecoveryLocator(target)
        : kind === 'detached'
          ? '#retained-target'
          : '#portable-target';
    expect(result.frameSession.frames[0]?.linkedElementSelector).toBe(expected);
    expect(result.annotations.frameOrders[0]?.linkedElementSelector).toBe(expected);
    expect(value.frameSession.frames[0]?.linkedElementSelector).toBe('#portable-target');
    target.remove();
  }
);
