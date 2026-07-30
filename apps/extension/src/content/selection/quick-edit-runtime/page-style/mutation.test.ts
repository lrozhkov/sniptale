// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  browserAnnotationSession,
  createBrowserAnnotationTargetEvidence,
} from '../../../parser/page-preparation/annotations';
import { publishPageStyleAnnotation } from './annotation';
import { applyPageStyleMutation, createPageStyleHistoryEffect } from './mutation';
import type { CssDeclarationRequest, PageStyleMutationBatch } from './types';

function appendVisible<T extends Element>(element: T, root: ParentNode = document.body): T {
  const rect = DOMRect.fromRect({ height: 40, width: 80, x: 10, y: 20 });
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => ({
      0: rect,
      [Symbol.iterator]: () => [rect][Symbol.iterator](),
      item: (index: number) => (index === 0 ? rect : null),
      length: 1,
    }),
  });
  root.append(element);
  return element;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it.each([
  ['HTML', () => document.createElement('div')],
  ['SVG', () => document.createElementNS('http://www.w3.org/2000/svg', 'rect')],
])('applies, removes, and replays exact declarations on %s', (_label, createElement) => {
  const target = appendVisible(createElement());
  target.style.setProperty('color', 'blue', 'important');

  const result = applyPageStyleMutation({
    declarations: [
      { property: 'color', value: 'red' },
      { property: 'font-size', value: '18px', priority: 'important' },
    ],
    target,
  });
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') return;

  expect(result.batch.declarations).toEqual([
    expect.objectContaining({
      after: { priority: '', value: 'red' },
      before: { priority: 'important', value: 'blue' },
      property: 'color',
    }),
    expect.objectContaining({
      after: { priority: 'important', value: '18px' },
      before: { priority: '', value: '' },
      property: 'font-size',
    }),
  ]);

  const effect = createPageStyleHistoryEffect(result.batch);
  expect(effect.apply('undo')).toEqual({ failures: [], success: true });
  expect(target.style.getPropertyValue('color')).toBe('blue');
  expect(target.style.getPropertyPriority('color')).toBe('important');
  expect(target.style.getPropertyValue('font-size')).toBe('');
  expect(effect.apply('redo')).toEqual({ failures: [], success: true });
  expect(target.style.getPropertyValue('font-size')).toBe('18px');
  expect(target.style.getPropertyPriority('font-size')).toBe('important');
});

it('removes a declaration through removeProperty and records the empty endpoint', () => {
  const target = appendVisible(document.createElement('div'));
  target.style.setProperty('color', 'red', 'important');

  const result = applyPageStyleMutation({
    declarations: [{ property: 'color', value: null }],
    target,
  });

  expect(result.status).toBe('applied');
  if (result.status !== 'applied') return;
  expect(target.style.getPropertyValue('color')).toBe('');
  expect(result.batch.declarations[0]).toMatchObject({
    after: { priority: '', value: '' },
    before: { priority: 'important', value: 'red' },
  });
});

it('rolls back earlier declarations when a later CSSOM write fails', () => {
  const target = appendVisible(document.createElement('div'));
  const originalSetProperty = target.style.setProperty.bind(target.style);
  vi.spyOn(target.style, 'setProperty').mockImplementation((property, value, priority) => {
    if (property === 'font-size') {
      throw new Error('page blocked write');
    }
    originalSetProperty(property, value, priority);
  });

  const result = applyPageStyleMutation({
    declarations: [
      { property: 'color', value: 'red' },
      { property: 'font-size', value: '18px' },
    ],
    target,
  });

  expect(result).toMatchObject({ code: 'mutation-failed', status: 'failed' });
  expect(target.style.getPropertyValue('color')).toBe('');
  expect(target.style.getPropertyValue('font-size')).toBe('');
});

it('reports and captures the residual delta when silent rollback does not restore source', () => {
  const target = appendVisible(document.createElement('div'));
  const originalSetProperty = target.style.setProperty.bind(target.style);
  const setProperty = vi
    .spyOn(target.style, 'setProperty')
    .mockImplementation((property, value, priority) => {
      if (property !== 'font-size') {
        originalSetProperty(property, value, priority);
      }
    });
  const removeProperty = vi.spyOn(target.style, 'removeProperty').mockReturnValue('');

  const result = applyPageStyleMutation({
    declarations: [
      { property: 'color', value: 'red' },
      { property: 'font-size', value: '18px' },
    ],
    target,
  });

  expect(result).toMatchObject({ code: 'rollback-failed', status: 'failed' });
  if (result.status !== 'failed' || !result.recoveryBatch) return;
  expect(result.recoveryBatch.declarations).toEqual([
    expect.objectContaining({
      after: { priority: '', value: 'red' },
      before: { priority: '', value: '' },
      property: 'color',
    }),
  ]);
  setProperty.mockRestore();
  removeProperty.mockRestore();
  expect(createPageStyleHistoryEffect(result.recoveryBatch).apply('undo')).toEqual({
    failures: [],
    success: true,
  });
  expect(target.style.color).toBe('');
});

it('rejects URL-bearing image functions during initial apply and history replay', () => {
  const target = appendVisible(document.createElement('div'));
  expect(
    applyPageStyleMutation({
      declarations: [
        {
          property: 'background-image',
          value: 'image-set("https://tracker.test/pixel.png" 1x)',
        },
      ],
      target,
    })
  ).toMatchObject({ code: 'invalid-declaration', status: 'failed' });

  const unsafeBatch: PageStyleMutationBatch = {
    attributes: [],
    declarations: [
      {
        after: {
          priority: '',
          value: 'image-set("https://tracker.test/pixel.png" 1x)',
        },
        afterPolicy: { source: 'inspector' },
        before: { priority: '', value: '' },
        beforePolicy: { source: 'inspector' },
        order: 1,
        property: 'background-image',
      },
    ],
    target,
    text: null,
  };
  expect(createPageStyleHistoryEffect(unsafeBatch).apply('redo')).toEqual({
    failures: ['invalid-declaration'],
    success: false,
  });
  expect(target.style.backgroundImage).toBe('');
});

it('validates resolver blob provenance independently across replace, clear, undo, and redo', () => {
  const target = appendVisible(document.createElement('div'));
  const assetOne = 'blob:https://example.test/asset-1';
  const assetTwo = 'blob:https://example.test/asset-2';
  const applyAsset = (assetUrl: string) =>
    applyPageStyleMutation({
      declarations: [
        {
          assetUrl,
          property: 'background-image',
          source: 'resolved-asset',
          value: `url("${assetUrl}")`,
        },
      ],
      target,
    });

  const first = applyAsset(assetOne);
  const second = applyAsset(assetTwo);
  const cleared = applyPageStyleMutation({
    declarations: [{ property: 'background-image', value: null }],
    target,
  });
  expect(first.status).toBe('applied');
  expect(second.status).toBe('applied');
  expect(cleared.status).toBe('applied');
  if (first.status !== 'applied' || second.status !== 'applied' || cleared.status !== 'applied') {
    return;
  }

  const replaceEffect = createPageStyleHistoryEffect(second.batch);
  const clearEffect = createPageStyleHistoryEffect(cleared.batch);
  expect(clearEffect.apply('undo')).toMatchObject({ success: true });
  expect(target.style.backgroundImage).toContain(assetTwo);
  expect(replaceEffect.apply('undo')).toMatchObject({ success: true });
  expect(target.style.backgroundImage).toContain(assetOne);
  expect(replaceEffect.apply('redo')).toMatchObject({ success: true });
  expect(target.style.backgroundImage).toContain(assetTwo);
  expect(clearEffect.apply('redo')).toMatchObject({ success: true });
  expect(target.style.backgroundImage).toBe('');
});

it('does not grant resolver provenance to a page-owned blob lookalike', () => {
  const target = appendVisible(document.createElement('div'));
  target.style.setProperty('background-image', 'url("blob:https://example.test/page-owned")');

  expect(
    applyPageStyleMutation({
      declarations: [{ property: 'background-image', value: null }],
      target,
    })
  ).toMatchObject({ code: 'invalid-declaration', status: 'failed' });
  expect(target.style.backgroundImage).toContain('page-owned');
});

it('invalidates resolver provenance after a page-owned away-and-back write', () => {
  const target = appendVisible(document.createElement('div'));
  const assetUrl = 'blob:https://example.test/asset-1';
  const applied = applyPageStyleMutation({
    declarations: [
      {
        assetUrl,
        property: 'background-image',
        source: 'resolved-asset',
        value: `url("${assetUrl}")`,
      },
    ],
    target,
  });
  expect(applied.status).toBe('applied');
  if (applied.status !== 'applied') return;

  target.style.setProperty('background-image', 'linear-gradient(red, blue)');
  target.style.setProperty('background-image', `url("${assetUrl}")`);

  expect(
    applyPageStyleMutation({
      declarations: [{ property: 'background-image', value: null }],
      target,
    })
  ).toMatchObject({ code: 'invalid-declaration', status: 'failed' });
  expect(createPageStyleHistoryEffect(applied.batch).apply('undo')).toEqual({
    failures: ['invalid-declaration'],
    success: false,
  });
  expect(target.style.backgroundImage).toContain(assetUrl);
});

it('fails closed when a custom element reenters owner declaration writes', () => {
  const elementName = 'x-page-style-reentrant-mutation';
  class ReentrantStyleElement extends HTMLElement {
    reentrantEnabled = false;
  }
  customElements.define(elementName, ReentrantStyleElement);
  const target = appendVisible(document.createElement(elementName) as ReentrantStyleElement);
  const addReentrantRecords = () => {
    if (!target.reentrantEnabled) return;
    const intended = target.getAttribute('style');
    target.setAttribute('style', `${intended ?? ''}; --page-reentrant-write: 1`);
    if (intended === null) target.removeAttribute('style');
    else target.setAttribute('style', intended);
  };
  const originalSetProperty = target.style.setProperty.bind(target.style);
  vi.spyOn(target.style, 'setProperty').mockImplementation((property, value, priority) => {
    originalSetProperty(property, value, priority);
    addReentrantRecords();
  });
  const originalRemoveProperty = target.style.removeProperty.bind(target.style);
  vi.spyOn(target.style, 'removeProperty').mockImplementation((property) => {
    const previous = originalRemoveProperty(property);
    addReentrantRecords();
    return previous;
  });
  const assetUrl = 'blob:https://example.test/reentrant-asset';
  const request = {
    assetUrl,
    property: 'background-image',
    source: 'resolved-asset' as const,
    value: `url("${assetUrl}")`,
  } satisfies CssDeclarationRequest;

  target.reentrantEnabled = true;
  expect(applyPageStyleMutation({ declarations: [request], target })).toMatchObject({
    status: 'failed',
  });
  expect(target.style.backgroundImage).toBe('');

  target.reentrantEnabled = false;
  const applied = applyPageStyleMutation({ declarations: [request], target });
  expect(applied.status).toBe('applied');
  if (applied.status !== 'applied') return;
  const effect = createPageStyleHistoryEffect(applied.batch);

  target.reentrantEnabled = true;
  expect(effect.apply('undo')).toMatchObject({ success: false });
  expect(target.style.backgroundImage).toContain(assetUrl);

  target.reentrantEnabled = false;
  target.style.removeProperty('background-image');
  const redoApplied = applyPageStyleMutation({ declarations: [request], target });
  expect(redoApplied.status).toBe('applied');
  if (redoApplied.status !== 'applied') return;
  const redoEffect = createPageStyleHistoryEffect(redoApplied.batch);
  expect(redoEffect.apply('undo')).toEqual({ failures: [], success: true });
  target.reentrantEnabled = true;
  expect(redoEffect.apply('redo')).toMatchObject({ success: false });
  expect(target.style.backgroundImage).toBe('');
});

it('does not reconstruct resolver policy for an exact reentrant rollback residual', () => {
  browserAnnotationSession.resetForDocument();
  const target = appendVisible(document.createElement('div'));
  const assetUrl = 'blob:https://example.test/reentrant-residual';
  const request = {
    assetUrl,
    property: 'background-image',
    source: 'resolved-asset' as const,
    value: `url("${assetUrl}")`,
  } satisfies CssDeclarationRequest;
  const addAwayAndBackRecords = () => {
    const intended = target.getAttribute('style');
    target.setAttribute('style', `${intended ?? ''}; --page-reentrant-write: 1`);
    if (intended === null) target.removeAttribute('style');
    else target.setAttribute('style', intended);
  };
  const originalSetProperty = target.style.setProperty.bind(target.style);
  vi.spyOn(target.style, 'setProperty').mockImplementation((property, value, priority) => {
    originalSetProperty(property, value, priority);
    addAwayAndBackRecords();
  });
  vi.spyOn(target.style, 'removeProperty').mockImplementation(() => {
    addAwayAndBackRecords();
    return '';
  });

  const result = applyPageStyleMutation({ declarations: [request], target });
  expect(result).toMatchObject({ code: 'rollback-failed', status: 'failed' });
  if (result.status !== 'failed' || !result.recoveryBatch) return;
  expect(result.recoveryBatch.declarations[0]?.afterPolicy).toEqual({ source: 'inspector' });
  expect(target.style.backgroundImage).toContain(assetUrl);

  expect(() =>
    publishPageStyleAnnotation({
      changes: result.recoveryBatch!.declarations,
      evidence: createBrowserAnnotationTargetEvidence(target),
      target,
    })
  ).toThrow('Cannot publish invalid page-style annotation evidence');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  expect(
    createPageStyleHistoryEffect(result.recoveryBatch, { recoveryOnly: true }).apply('redo')
  ).toEqual({ failures: ['recovery-redo-disabled'], success: false });
});

it('returns one-way recovery for silent undo compensation mismatch', () => {
  const target = appendVisible(document.createElement('div'));
  const applied = applyPageStyleMutation({
    declarations: [
      { property: 'color', value: 'red' },
      { property: 'font-size', value: '18px' },
    ],
    target,
  });
  expect(applied.status).toBe('applied');
  if (applied.status !== 'applied') return;

  const originalRemoveProperty = target.style.removeProperty.bind(target.style);
  const removeProperty = vi
    .spyOn(target.style, 'removeProperty')
    .mockImplementation((property) =>
      property === 'color' ? originalRemoveProperty(property) : ''
    );
  const originalSetProperty = target.style.setProperty.bind(target.style);
  const setProperty = vi
    .spyOn(target.style, 'setProperty')
    .mockImplementation((property, value, priority) => {
      if (property !== 'color') originalSetProperty(property, value, priority);
    });
  const onRecovery = vi.fn();
  const result = createPageStyleHistoryEffect(applied.batch, { onRecovery }).apply('undo');

  expect(result).toMatchObject({
    failures: ['mutation-failed', 'rollback-failed'],
    success: false,
  });
  expect(result.recovery?.effect.recoveryOnly).toBe(true);
  expect(onRecovery).toHaveBeenCalledOnce();
  setProperty.mockRestore();
  removeProperty.mockRestore();
  expect(result.recovery?.effect.apply('undo')).toEqual({ failures: [], success: true });
  expect(target.style.color).toBe('red');
  expect(target.style.fontSize).toBe('18px');
});

it('returns one-way recovery for silent redo compensation mismatch', () => {
  const target = appendVisible(document.createElement('div'));
  const applied = applyPageStyleMutation({
    declarations: [
      { property: 'color', value: 'red' },
      { property: 'font-size', value: '18px' },
    ],
    target,
  });
  expect(applied.status).toBe('applied');
  if (applied.status !== 'applied') return;
  const effect = createPageStyleHistoryEffect(applied.batch);
  expect(effect.apply('undo')).toMatchObject({ success: true });

  const originalSetProperty = target.style.setProperty.bind(target.style);
  const setProperty = vi
    .spyOn(target.style, 'setProperty')
    .mockImplementation((property, value, priority) => {
      if (property !== 'font-size') originalSetProperty(property, value, priority);
    });
  const removeProperty = vi.spyOn(target.style, 'removeProperty').mockReturnValue('');
  const result = effect.apply('redo');

  expect(result).toMatchObject({
    failures: ['mutation-failed', 'rollback-failed'],
    success: false,
  });
  expect(result.recovery?.effect.recoveryOnly).toBe(true);
  setProperty.mockRestore();
  removeProperty.mockRestore();
  expect(result.recovery?.effect.apply('undo')).toEqual({ failures: [], success: true });
  expect(target.style.color).toBe('');
  expect(target.style.fontSize).toBe('');
});

it('fails a detached original without mutating an SPA replacement with the same selector', () => {
  const original = appendVisible(document.createElement('div'));
  original.id = 'same';
  const result = applyPageStyleMutation({
    declarations: [{ property: 'color', value: 'red' }],
    target: original,
  });
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') return;

  original.remove();
  const replacement = appendVisible(document.createElement('div'));
  replacement.id = 'same';
  expect(createPageStyleHistoryEffect(result.batch).apply('undo')).toEqual({
    failures: ['detached-target'],
    success: false,
  });
  expect(replacement.style.getPropertyValue('color')).toBe('');
});

it('applies to an inner same-origin iframe target and to an iframe element target', () => {
  const iframe = appendVisible(document.createElement('iframe'));
  const iframeDocument = iframe.contentDocument;
  if (!iframeDocument) throw new Error('Expected iframe document');
  const inner = appendVisible(iframeDocument.createElement('div'), iframeDocument.body);

  expect(
    applyPageStyleMutation({
      declarations: [{ property: 'color', value: 'red' }],
      target: inner,
    }).status
  ).toBe('applied');
  expect(
    applyPageStyleMutation({
      declarations: [{ property: 'width', value: '120px' }],
      target: iframe,
    }).status
  ).toBe('applied');
});
