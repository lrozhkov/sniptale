// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  browserAnnotationSession,
  createBrowserAnnotationTargetEvidence,
} from '../../parser/page-preparation/annotations';
import { createRecoveryLocator } from '../../parser/page-preparation/history/recovery-locators';
import { createDocumentReviewSession, resolveReviewTarget } from './dom';
import { createReviewSessionRuntime } from './runtime';
import { emptyReviewSessionDocument } from './controller';
import {
  setDesignReviewTool,
  openDesignReviewTarget,
  dismissDesignReviewSelection,
} from '../../selection/design-review';
import { disableNavigationLock } from '../../selection/locker';
import { deleteDesignReviewRecord } from '../../overlay/design-review/runtime/record';
import { finalizeDesignReviewCommentDraft } from '../../overlay/design-review/session/comment-draft-finalization';
import { flushPendingPageStyleHistory } from '../../overlay/design-review/runtime/actions';

vi.mock('./runtime', () => ({ createReviewSessionRuntime: vi.fn() }));
vi.mock('./client', () => ({
  DesignReviewSessionClient: class {
    request = vi.fn();
    isConnected = vi.fn();
  },
}));
vi.mock('../../selection/design-review', () => ({
  setDesignReviewTool: vi.fn(() => true),
  openDesignReviewTarget: vi.fn(() => true),
  dismissDesignReviewSelection: vi.fn(),
}));
vi.mock('../../selection/locker', () => ({ disableNavigationLock: vi.fn() }));
vi.mock('../../overlay/design-review/runtime/record', () => ({
  deleteDesignReviewRecord: vi.fn(),
}));
vi.mock('../../overlay/design-review/session/comment-draft-finalization', () => ({
  finalizeDesignReviewCommentDraft: vi.fn(),
}));
vi.mock('../../overlay/design-review/runtime/actions', () => ({
  flushPendingPageStyleHistory: vi.fn(),
}));

function adapter() {
  const enable = vi.fn();
  createDocumentReviewSession(enable);
  const ports = vi.mocked(createReviewSessionRuntime).mock.calls.at(-1)?.[0];
  if (!ports) throw new Error('Expected document adapter');
  return { ports, enable };
}

beforeEach(() => vi.clearAllMocks());

function target(id: string, text: string) {
  const element = document.createElement('button');
  element.id = id;
  element.textContent = text;
  Object.defineProperty(element, 'getClientRects', {
    value: () => [DOMRect.fromRect({ width: 80, height: 40 })],
  });
  document.body.append(element);
  return element;
}
function record(element: Element) {
  const evidence = createBrowserAnnotationTargetEvidence(element);
  evidence.locator = createRecoveryLocator(element);
  return {
    annotationId: 1,
    creationOrder: 1,
    comment: 'Keep this note',
    propertyChanges: [],
    evidence,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  browserAnnotationSession.resetForDocument();
});
it('resolves a stable selector after a structural path moves', () => {
  const element = target('review', 'Review target');
  const saved = record(element);
  document.body.prepend(target('other', 'Different target'));
  expect(resolveReviewTarget(saved)).toBe(element);
});
it('refuses ambiguous semantic matches without replacing saved evidence', () => {
  const element = target('review', 'Same label');
  const saved = record(element);
  const other = target('other', 'Same label');
  document.body.prepend(other);
  expect(resolveReviewTarget(saved)).toBeNull();
  expect(saved.comment).toBe('Keep this note');
});
it('refuses another page and changed target text', () => {
  const element = target('review', 'Original label');
  const saved = record(element);
  element.textContent = 'Different label';
  expect(resolveReviewTarget(saved)).toBeNull();
  element.textContent = 'Original label';
  saved.evidence.pageUrl = 'https://unrelated.test/';
  expect(resolveReviewTarget(saved)).toBeNull();
});
it('does not resolve a missing top-document target inside another frame', () => {
  const original = target('review', 'Original label');
  const saved = record(original);
  original.remove();
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const inside = frame.contentDocument!.createElement('button');
  inside.id = 'review';
  inside.textContent = 'Original label';
  frame.contentDocument!.body.append(inside);
  expect(resolveReviewTarget(saved)).toBeNull();
});

it('replays exact style endpoints and text as plain text, and is idempotent', () => {
  const element = target('replay', 'Before');
  element.style.setProperty('color', 'red', 'important');
  const saved = {
    ...record(element),
    propertyChanges: [
      {
        property: 'color',
        before: { value: 'red', priority: 'important' },
        after: { value: 'blue', priority: '' },
        order: 1,
      },
    ],
    textChange: { before: 'Before', after: '<img src=x onerror=alert(1)>' },
  };
  const { ports } = adapter();
  ports.restoreTarget?.(saved, element);
  expect(element.style.color).toBe('blue');
  expect(element.style.getPropertyPriority('color')).toBe('');
  expect(element.textContent).toBe(saved.textChange.after);
  expect(element.childElementCount).toBe(0);
  ports.restoreTarget?.(saved, element);
  expect(element.textContent).toBe(saved.textChange.after);
});
it('preserves page edits and rejects unsupported or unsafe declarations before text replay', () => {
  const element = target('safe', 'Before');
  const saved = {
    ...record(element),
    propertyChanges: [
      {
        property: 'color',
        before: { value: 'red', priority: '' },
        after: { value: 'blue', priority: '' },
        order: 1,
      },
    ],
    textChange: { before: 'Before', after: 'After' },
  };
  const { ports } = adapter();
  element.style.color = 'green';
  ports.restoreTarget?.(saved, element);
  expect(element.style.color).toBe('green');
  expect(element.textContent).toBe('Before');
  saved.propertyChanges[0]!.property = 'background-image';
  ports.restoreTarget?.(saved, element);
  expect(element.textContent).toBe('Before');
  saved.propertyChanges[0]!.property = 'color';
  saved.propertyChanges[0]!.before.value = 'green';
  saved.propertyChanges[0]!.after.value = 'url(https://example.test/private)';
  ports.restoreTarget?.(saved, element);
  expect(element.style.color).toBe('green');
  expect(element.textContent).toBe('Before');
});
it('preserves nested markup, changed text, and ineligible targets', () => {
  const element = target('nested', 'Before');
  const saved = { ...record(element), textChange: { before: 'Before', after: 'After' } };
  const { ports } = adapter();
  const child = document.createElement('span');
  child.textContent = 'Before';
  element.replaceChildren(child);
  ports.restoreTarget?.(saved, element);
  expect(element.firstElementChild).toBe(child);
  element.replaceChildren('Page edited');
  ports.restoreTarget?.(saved, element);
  expect(element.textContent).toBe('Page edited');
  element.remove();
  element.textContent = 'Before';
  ports.restoreTarget?.(saved, element);
  expect(element.textContent).toBe('Before');
});
it('refreshes connected locators in snapshots without changing disconnected evidence', () => {
  const element = target('old', 'Before');
  const detached = target('gone', 'Gone');
  browserAnnotationSession.setComment({
    target: element,
    evidence: record(element).evidence,
    comment: 'First',
  });
  browserAnnotationSession.setComment({
    target: detached,
    evidence: record(detached).evidence,
    comment: 'Second',
  });
  detached.remove();
  element.id = 'new';
  const { ports } = adapter();
  const snapshot = ports.annotations.captureSnapshot();
  expect(snapshot.domRecords[0]?.evidence.locator).toBe(createRecoveryLocator(element));
  expect(snapshot.domRecords[1]?.comment).toBe('Second');
});
it('opens feedback only after selecting the comment tool and restores navigation authority', () => {
  const element = target('open', 'Open');
  const { ports, enable } = adapter();
  expect(ports.openTarget(element)).toBe(true);
  expect(openDesignReviewTarget).toHaveBeenCalledWith(element, 'feedback');
  vi.mocked(setDesignReviewTool).mockReturnValueOnce(false);
  expect(ports.openTarget(element)).toBe(false);
  expect(openDesignReviewTarget).toHaveBeenCalledTimes(1);
  ports.restoreMode({ ...emptyReviewSessionDocument(), enabled: true, tool: 'navigate' });
  expect(enable).toHaveBeenCalledWith(true);
  expect(disableNavigationLock).toHaveBeenCalledTimes(1);
  ports.restoreMode(emptyReviewSessionDocument());
  expect(enable).toHaveBeenLastCalledWith(false);
  expect(disableNavigationLock).toHaveBeenCalledTimes(1);
});
it('removes only eligible live targets and finalizes pending edits before clearing', async () => {
  const element = target('live', 'Live');
  const detached = target('detached', 'Detached');
  browserAnnotationSession.setComment({
    target: element,
    evidence: record(element).evidence,
    comment: 'Live',
  });
  browserAnnotationSession.setComment({
    target: detached,
    evidence: record(detached).evidence,
    comment: 'Gone',
  });
  detached.remove();
  const { ports } = adapter();
  ports.removeTarget(detached);
  expect(deleteDesignReviewRecord).not.toHaveBeenCalled();
  expect(dismissDesignReviewSelection).toHaveBeenCalledTimes(1);
  ports.removeTarget(element);
  expect(deleteDesignReviewRecord).toHaveBeenCalledWith(element);
  vi.mocked(deleteDesignReviewRecord).mockClear();
  await ports.clearTargets();
  expect(deleteDesignReviewRecord).toHaveBeenCalledExactlyOnceWith(element);
  expect(finalizeDesignReviewCommentDraft).toHaveBeenCalledTimes(1);
  expect(flushPendingPageStyleHistory).toHaveBeenCalledTimes(1);
  expect(vi.mocked(finalizeDesignReviewCommentDraft).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(deleteDesignReviewRecord).mock.invocationCallOrder[0]!
  );
  expect(vi.mocked(flushPendingPageStyleHistory).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(deleteDesignReviewRecord).mock.invocationCallOrder[0]!
  );
  expect(dismissDesignReviewSelection).toHaveBeenCalledTimes(3);
});
