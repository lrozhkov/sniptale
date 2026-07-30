// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  applyPageStyleMutation,
  applyPageStyleMutationBatch,
  capturePageStyleMutationResidual,
  createPageStyleHistoryEffect,
} from './mutation';

function appendVisible<T extends Element>(element: T, root: ParentNode = document.body): T {
  const rect = DOMRect.fromRect({ height: 40, width: 80 });
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

function createTarget() {
  return appendVisible(document.createElement('div'));
}

it('replays a direct declaration batch through exact endpoints', () => {
  const target = createTarget();
  const applied = applyPageStyleMutation({
    declarations: [{ property: 'color', value: 'red' }],
    target,
  });
  expect(applied.status).toBe('applied');
  if (applied.status !== 'applied') return;

  expect(applyPageStyleMutationBatch(applied.batch, 'undo')).toEqual({
    failures: [],
    success: true,
  });
  expect(target.style.color).toBe('');
  expect(applyPageStyleMutationBatch(applied.batch, 'redo')).toEqual({
    failures: [],
    success: true,
  });
  expect(target.style.color).toBe('red');
});

it('does not blindly overwrite a page-owned declaration change', () => {
  const target = createTarget();
  const applied = applyPageStyleMutation({
    declarations: [{ property: 'color', value: 'red' }],
    target,
  });
  expect(applied.status).toBe('applied');
  if (applied.status !== 'applied') return;

  target.style.color = 'blue';
  expect(applyPageStyleMutationBatch(applied.batch, 'undo')).toEqual({
    failures: ['stale-target-state'],
    success: false,
  });
  expect(target.style.color).toBe('blue');
});

it('rejects unsafe declaration input before mutating the target', () => {
  const target = createTarget();
  const result = applyPageStyleMutation({
    declarations: [{ property: 'box-shadow', value: 'url(https://example.test/x)' }],
    target,
  });
  expect(result).toEqual(
    expect.objectContaining({ code: 'invalid-declaration', status: 'failed' })
  );
  expect(target.getAttribute('style')).toBeNull();
});

it('rejects a replay batch when either declaration endpoint becomes unsafe', () => {
  const target = createTarget();
  const applied = applyPageStyleMutation({
    declarations: [{ property: 'color', value: 'red' }],
    target,
  });
  expect(applied.status).toBe('applied');
  if (applied.status !== 'applied') return;

  const declaration = applied.batch.declarations[0];
  expect(declaration).toBeDefined();
  if (!declaration) return;
  declaration.after.value = 'url(https://example.test/x)';

  expect(applyPageStyleMutationBatch(applied.batch, 'undo')).toEqual({
    failures: ['invalid-declaration'],
    success: false,
  });
  expect(target.style.color).toBe('red');
});

it('captures residual policy for both known and unmatched declaration endpoints', async () => {
  const target = createTarget();
  const applied = applyPageStyleMutation({
    declarations: [{ property: 'color', value: 'red' }],
    target,
  });
  expect(applied.status).toBe('applied');
  if (applied.status !== 'applied') return;

  const knownEndpoint = capturePageStyleMutationResidual(applied.batch, 'before');
  expect(knownEndpoint.declarations[0]?.afterPolicy.source).toBe('inspector');

  target.style.color = 'blue';
  await Promise.resolve();
  const unmatchedEndpoint = capturePageStyleMutationResidual(applied.batch, 'after');
  expect(unmatchedEndpoint.declarations[0]?.afterPolicy.source).toBe('inspector');
});

it.each([
  ['HTML', () => document.createElement('div')],
  ['SVG', () => document.createElementNS('http://www.w3.org/2000/svg', 'rect')],
])('preserves exact declaration values and priorities on %s', (_label, createElement) => {
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

it('removes a declaration and records the empty endpoint', () => {
  const target = createTarget();
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
  const target = createTarget();
  const originalSetProperty = target.style.setProperty.bind(target.style);
  vi.spyOn(target.style, 'setProperty').mockImplementation((property, value, priority) => {
    if (property === 'font-size') throw new Error('page blocked write');
    originalSetProperty(property, value, priority);
  });

  expect(
    applyPageStyleMutation({
      declarations: [
        { property: 'color', value: 'red' },
        { property: 'font-size', value: '18px' },
      ],
      target,
    })
  ).toMatchObject({ code: 'mutation-failed', status: 'failed' });
  expect(target.style.getPropertyValue('color')).toBe('');
  expect(target.style.getPropertyValue('font-size')).toBe('');
});

it('captures the residual delta when rollback cannot restore the source', () => {
  const target = createTarget();
  const originalSetProperty = target.style.setProperty.bind(target.style);
  const setProperty = vi
    .spyOn(target.style, 'setProperty')
    .mockImplementation((property, value, priority) => {
      if (property !== 'font-size') originalSetProperty(property, value, priority);
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

it('fails closed when a custom element reenters direct declaration writes', () => {
  const elementName = `x-review-reentrant-${crypto.randomUUID()}`;
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
  const request = { property: 'color' as const, value: 'red' };

  target.reentrantEnabled = true;
  expect(applyPageStyleMutation({ declarations: [request], target })).toMatchObject({
    status: 'failed',
  });
  expect(target.style.color).toBe('');

  target.reentrantEnabled = false;
  const applied = applyPageStyleMutation({ declarations: [request], target });
  expect(applied.status).toBe('applied');
  if (applied.status !== 'applied') return;
  target.reentrantEnabled = true;
  expect(createPageStyleHistoryEffect(applied.batch).apply('undo')).toMatchObject({
    success: false,
  });
  expect(target.style.color).toBe('red');
});

it('returns one-way recovery for a silent undo compensation mismatch', () => {
  const target = createTarget();
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

it('returns one-way recovery for a silent redo compensation mismatch', () => {
  const target = createTarget();
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

it('does not mutate an SPA replacement after the original target detaches', () => {
  const original = createTarget();
  original.id = 'same';
  const result = applyPageStyleMutation({
    declarations: [{ property: 'color', value: 'red' }],
    target: original,
  });
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') return;

  original.remove();
  const replacement = createTarget();
  replacement.id = 'same';
  expect(createPageStyleHistoryEffect(result.batch).apply('undo')).toEqual({
    failures: ['detached-target'],
    success: false,
  });
  expect(replacement.style.getPropertyValue('color')).toBe('');
});

it('applies to a same-origin iframe descendant and to the iframe element', () => {
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
