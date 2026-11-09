// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBridgedMouseEvent } from '../../../platform/trusted-events/synthetic-mouse';
import type {
  ReviewSessionRuntime,
  ReviewSessionState,
} from '../../../application/design-review-session/runtime';

const trustedEventMocks = vi.hoisted(() => ({ isTrustedDomEvent: vi.fn(() => true) }));
vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/trusted-events')>()),
  isTrustedDomEvent: trustedEventMocks.isTrustedDomEvent,
}));

const review = vi.hoisted(() => ({
  runtime: null as Pick<
    ReviewSessionRuntime,
    | 'subscribe'
    | 'getSnapshot'
    | 'openRecord'
    | 'deleteRecord'
    | 'undoDelete'
    | 'clear'
    | 'resume'
    | 'retry'
    | 'setPanelOpen'
    | 'setPosition'
  > | null,
  snapshot: null as ReviewSessionState | null,
}));
vi.mock('../../../application/design-review-session/use-session', () => ({
  useReviewSessionRuntime: () => review.runtime,
}));
import {
  browserAnnotationSession,
  type BrowserAnnotationTargetEvidence,
} from '../../../parser/page-preparation/annotations';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { DesignReviewFeedbackPanel } from './view';
import { DesignReviewActionMenu } from '../popover/action-menu';

let container: HTMLDivElement;
let root: Root;

function createEvidence(selector: string): BrowserAnnotationTargetEvidence {
  return {
    fileLabel: 'Home',
    frame: { kind: 'top-document' },
    locator: selector,
    nodePosition: { x: 20, y: 30 },
    pageUrl: new URL('/home', location.href).href,
    targetPath: `html > body > ${selector}`,
    targetSelector: selector,
    targetText: 'Save changes',
    viewport: { height: 720, width: 1280 },
  };
}

beforeEach(() => {
  trustedEventMocks.isTrustedDomEvent.mockReset();
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(true);
  review.runtime = null;
  review.snapshot = null;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('innerHeight', 720);
  vi.stubGlobal('innerWidth', 1280);
  Object.defineProperties(HTMLElement.prototype, {
    releasePointerCapture: { configurable: true, value: vi.fn() },
    setPointerCapture: { configurable: true, value: vi.fn() },
  });
  browserAnnotationSession.resetForDocument();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('lists only Design Review feedback and opens the live element from the row or preview', () => {
  const target = document.createElement('button');
  const textOnlyTarget = document.createElement('p');
  document.body.append(target, textOnlyTarget);
  const evidence = createEvidence('button.primary');
  browserAnnotationSession.setComment({ comment: 'Check the narrow layout', evidence, target });
  browserAnnotationSession.setDesignReviewAction({ action: 'fix', evidence, target });
  target.textContent = 'Changed live page copy';
  browserAnnotationSession.recordTextChange({
    after: 'After',
    before: 'Before',
    evidence: createEvidence('p'),
    target: textOnlyTarget,
  });
  const onClose = vi.fn();
  const onOpenRecord = vi.fn(() => true);

  act(() => {
    root.render(<DesignReviewFeedbackPanel onClose={onClose} onOpenRecord={onOpenRecord} open />);
  });

  expect(container.querySelector('.lucide-messages-square')).not.toBeNull();
  const items = container.querySelectorAll('[data-ui="content.design-review.feedback-item"]');
  expect(items).toHaveLength(1);
  expect(items[0]?.textContent).toContain('content.designReview.actionFix');
  expect(items[0]?.textContent).toContain('Check the narrow layout');
  expect(items[0]?.textContent).toContain('BUTTON · Save changes');
  expect(items[0]?.textContent).not.toContain('Changed live page copy');
  expect(
    items[0]?.querySelector<HTMLElement>('[data-ui="content.design-review.feedback-summary"]')
      ?.style.webkitLineClamp
  ).toBe('3');

  act(() => items[0]?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  const preview = document.querySelector('[data-ui="content.design-review.feedback-preview"]');
  expect(preview).not.toBeNull();
  expect(preview?.closest('[data-ui="content.design-review.feedback-panel"]')).toBeNull();

  act(() => items[0]?.querySelector<HTMLButtonElement>('button')?.click());
  expect(onOpenRecord).toHaveBeenCalledWith(1);
  expect(document.querySelector('[data-ui="content.design-review.feedback-preview"]')).toBeNull();

  const close = container.querySelector<HTMLButtonElement>(
    '[aria-label="content.designReview.panelClose"]'
  );
  act(() => close?.click());
  expect(onClose).toHaveBeenCalledOnce();
});

it('renders the empty session state', () => {
  act(() => {
    root.render(
      <DesignReviewFeedbackPanel onClose={vi.fn()} onOpenRecord={vi.fn(() => true)} open />
    );
  });

  expect(container.textContent).toContain('content.designReview.panelEmpty');
  expect(
    container.querySelectorAll('[data-ui="content.design-review.feedback-item"]')
  ).toHaveLength(0);
});

it('filters actions and dismisses the highest floating layer with focus restoration', async () => {
  const refineTarget = document.createElement('section');
  const fixTarget = document.createElement('button');
  const toolbarToggle = document.createElement('button');
  toolbarToggle.dataset['ui'] = 'content.toolbar.design-review-panel-button';
  document.body.append(refineTarget, fixTarget, toolbarToggle);
  browserAnnotationSession.setComment({
    comment: 'Refine spacing',
    evidence: createEvidence('section.card'),
    target: refineTarget,
  });
  browserAnnotationSession.setComment({
    comment: 'Fix contrast',
    evidence: createEvidence('button.primary'),
    target: fixTarget,
  });
  browserAnnotationSession.setDesignReviewAction({
    action: 'fix',
    evidence: createEvidence('button.primary'),
    target: fixTarget,
  });
  const onClose = vi.fn();

  act(() => {
    root.render(
      <DesignReviewFeedbackPanel onClose={onClose} onOpenRecord={vi.fn(() => true)} open />
    );
  });

  const filterTrigger = container.querySelector<HTMLButtonElement>(
    '[aria-label="content.designReview.panelFilter"]'
  );
  act(() => filterTrigger?.click());
  const filterMenu = container.querySelector(
    '[data-ui="content.design-review.feedback-filter-menu"]'
  );
  expect(filterMenu?.getAttribute('role')).toBe('menu');
  expect(filterMenu?.closest('.overflow-hidden')).toBeNull();
  const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 });
  filterMenu?.dispatchEvent(wheelEvent);
  expect(wheelEvent.defaultPrevented).toBe(true);
  const menuItems = Array.from(filterMenu?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  expect(menuItems.every((item) => item.getAttribute('role') === 'menuitemradio')).toBe(true);
  const fixItem = menuItems.find((item) => item.textContent === 'content.designReview.actionFix');
  act(() => fixItem?.click());
  const visibleItems = container.querySelectorAll(
    '[data-ui="content.design-review.feedback-item"]'
  );
  expect(visibleItems).toHaveLength(1);
  expect(visibleItems[0]?.textContent).toContain('Fix contrast');

  act(() => filterTrigger?.click());
  act(() => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(
    container.querySelector('[data-ui="content.design-review.feedback-filter-menu"]')
  ).toBeNull();

  act(() => filterTrigger?.click());
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }));
  });
  expect(
    container.querySelector('[data-ui="content.design-review.feedback-filter-menu"]')
  ).toBeNull();
  expect(document.activeElement).toBe(filterTrigger);
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }));
  });
  expect(onClose).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(toolbarToggle);
});

it('closes the feedback panel with Escape while the action switch is present', async () => {
  const onClose = vi.fn();
  act(() => {
    root.render(
      <>
        <DesignReviewFeedbackPanel onClose={onClose} onOpenRecord={vi.fn(() => true)} open />
        <DesignReviewActionMenu action="refine" onSelect={vi.fn()} />
      </>
    );
  });
  expect(
    container.querySelectorAll('[data-ui="content.design-review.action-switch"] button')
  ).toHaveLength(5);

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }));
  });
  expect(onClose).toHaveBeenCalledOnce();
});

it('searches feedback and drags the panel by its header', () => {
  const target = document.createElement('div');
  document.body.append(target);
  browserAnnotationSession.setComment({
    comment: 'Improve card spacing',
    evidence: createEvidence('div.card'),
    target,
  });

  act(() => {
    root.render(
      <DesignReviewFeedbackPanel onClose={vi.fn()} onOpenRecord={vi.fn(() => true)} open />
    );
  });

  const input = container.querySelector<HTMLInputElement>('input');
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    valueSetter?.call(input, 'missing');
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(container.textContent).toContain('content.designReview.panelNoResults');

  const clear = container.querySelector<HTMLButtonElement>('.sniptale-field-clear');
  expect(clear).not.toBeNull();
  act(() => clear?.click());
  expect(input?.value).toBe('');
  expect(document.activeElement).toBe(input);
  expect(container.querySelector('.sniptale-field-clear')).toBeNull();
  expect(container.textContent).toContain('Improve card spacing');
  expect(browserAnnotationSession.getState().domRecords[0]?.comment).toBe('Improve card spacing');

  const panel = container.querySelector<HTMLElement>(
    '[data-ui="content.design-review.feedback-panel"]'
  );
  const handle = container.querySelector<HTMLElement>(
    '[data-ui="content.design-review.feedback-panel-drag-handle"]'
  );
  act(() => {
    handle?.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 30, clientY: 80 })
    );
    handle?.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 90, clientY: 140 })
    );
    handle?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });
  expect(panel?.style.left).toBe('84px');
  expect(panel?.style.top).toBe('132px');
});

it('keeps closed feedback chrome unmounted until the panel is opened', () => {
  const props = { onClose: vi.fn(), onOpenRecord: vi.fn(() => true) };
  act(() => root.render(<DesignReviewFeedbackPanel {...props} open={false} />));
  expect(container.querySelector('[data-ui="content.design-review.feedback-panel"]')).toBeNull();
  act(() => root.render(<DesignReviewFeedbackPanel {...props} open />));
  expect(
    container.querySelector('[data-ui="content.design-review.feedback-panel"]')
  ).not.toBeNull();
  expect(props.onClose).not.toHaveBeenCalled();
});

function configureSavedReview() {
  const target = document.createElement('button');
  document.body.append(target);
  browserAnnotationSession.setComment({
    comment: 'Keep this feedback after navigation',
    evidence: createEvidence('button.saved'),
    target,
  });
  const record = browserAnnotationSession.getState().domRecords[0]!;
  browserAnnotationSession.resetForDocument();
  target.remove();
  review.snapshot = {
    revision: 1,
    active: true,
    records: [
      {
        id: 'saved-entry',
        record,
        unavailable: true,
        preview: { dataUrl: 'data:image/png;base64,c2F2ZWQ=', width: 100, height: 50 },
      },
    ],
    panelOpen: true,
    position: { x: 120, y: 90 },
    available: false,
    error: false,
    pending: false,
    canUndo: false,
  };
  const runtime = {
    getSnapshot: () => review.snapshot!,
    subscribe: vi.fn(() => () => undefined),
    openRecord: vi.fn(async () => false),
    deleteRecord: vi.fn(async () => undefined),
    undoDelete: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    setPanelOpen: vi.fn(),
    setPosition: vi.fn(),
  };
  review.runtime = runtime;
  return runtime;
}

it('keeps unavailable saved feedback and snapshots visible and separates open from delete', async () => {
  const runtime = configureSavedReview();
  const onOpenRecord = vi.fn(() => true);
  act(() =>
    root.render(<DesignReviewFeedbackPanel open onClose={vi.fn()} onOpenRecord={onOpenRecord} />)
  );
  const row = container.querySelector<HTMLElement>(
    '[data-ui="content.design-review.feedback-item"]'
  )!;
  expect(row.textContent).toContain('content.designReview.targetUnavailable');
  expect(row.querySelector('button button')).toBeNull();
  act(() => row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  const image = document.querySelector<HTMLElement>(
    '[data-ui="content.design-review.feedback-snapshot"]'
  );
  expect(image).not.toBeNull();
  expect(image?.shadowRoot).toBeNull();
  expect(image?.outerHTML).not.toContain('data:image');
  expect(image?.querySelector('img')).toBeNull();
  await act(async () => row.querySelector('button')?.click());
  expect(runtime.openRecord).toHaveBeenCalledWith('saved-entry');
  expect(onOpenRecord).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Keep this feedback after navigation');
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="content.designReview.panelDelete"]')
      ?.click()
  );
  expect(runtime.deleteRecord).toHaveBeenCalledWith('saved-entry');
  expect(runtime.openRecord).toHaveBeenCalledTimes(1);
});

it('retains records during a save failure and offers retry, undo, and explicit clear confirmation', async () => {
  const runtime = configureSavedReview();
  review.snapshot = { ...review.snapshot!, error: true, canUndo: true };
  const render = () =>
    root.render(
      <DesignReviewFeedbackPanel open onClose={vi.fn()} onOpenRecord={vi.fn(() => true)} />
    );
  act(render);
  expect(container.textContent).toContain('content.designReview.sessionSaveFailed');
  expect(container.textContent).toContain('Keep this feedback after navigation');
  const buttonWithText = (key: string) =>
    Array.from(container.querySelectorAll('button')).find((button) => button.textContent === key);
  await act(async () => buttonWithText('content.designReview.sessionRetry')?.click());
  expect(runtime.retry).toHaveBeenCalledOnce();
  await act(async () => buttonWithText('content.designReview.panelUndoDelete')?.click());
  expect(runtime.undoDelete).toHaveBeenCalledOnce();
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="content.designReview.panelClearAll"]')
      ?.click()
  );
  expect(runtime.clear).not.toHaveBeenCalled();
  const dialog =
    document.querySelector('[role="dialog"]') ?? document.querySelector('[role="alertdialog"]');
  expect(dialog?.textContent).toContain('content.designReview.panelClearConfirm');
  const cancel = Array.from(dialog?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === 'common.actions.cancel'
  );
  await act(async () => cancel?.click());
  expect(runtime.clear).not.toHaveBeenCalled();
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="content.designReview.panelClearAll"]')
      ?.click()
  );
  const confirm = Array.from(
    document.querySelectorAll('[role="dialog"] button, [role="alertdialog"] button')
  ).find((button) => button.textContent === 'content.designReview.panelClearAll');
  await act(async () => (confirm as HTMLButtonElement | undefined)?.click());
  expect(runtime.clear).toHaveBeenCalledOnce();
});

it('offers the last saved review and uses persisted panel position', async () => {
  const runtime = configureSavedReview();
  review.snapshot = { ...review.snapshot!, active: false, available: true, records: [] };
  act(() =>
    root.render(
      <DesignReviewFeedbackPanel open onClose={vi.fn()} onOpenRecord={vi.fn(() => true)} />
    )
  );
  const panel = container.querySelector<HTMLElement>(
    '[data-ui="content.design-review.feedback-panel"]'
  );
  expect(panel?.style.left).toBe('120px');
  expect(panel?.style.top).toBe('90px');
  const resume = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'content.designReview.sessionResume'
  );
  await act(async () => resume?.click());
  expect(runtime.resume).toHaveBeenCalledOnce();
  Object.defineProperties(panel, {
    offsetWidth: { configurable: true, value: 408 },
    offsetHeight: { configurable: true, value: 520 },
  });
  review.snapshot = { ...review.snapshot!, position: { x: 5000, y: 5000 } };
  act(() =>
    root.render(
      <DesignReviewFeedbackPanel open onClose={vi.fn()} onOpenRecord={vi.fn(() => true)} />
    )
  );
  expect(runtime.setPosition).toHaveBeenCalledWith({ x: 860, y: 188 });
});

it('keeps foreign-origin authored evidence private in rows, previews, and DOM clones', () => {
  configureSavedReview();
  const entry = review.snapshot!.records[0]!;
  entry.record.evidence.pageUrl = 'https://foreign.example.test/private-review';
  entry.record.evidence.targetText = 'Private foreign target';
  entry.record.evidence.targetPath = 'html > body > private-foreign-path';
  const attachShadow = vi.spyOn(Element.prototype, 'attachShadow');
  act(() =>
    root.render(
      <DesignReviewFeedbackPanel open onClose={vi.fn()} onOpenRecord={vi.fn(() => true)} />
    )
  );
  const row = container.querySelector<HTMLElement>(
    '[data-ui="content.design-review.feedback-item"]'
  )!;
  expect(row.textContent).not.toContain(entry.record.comment);
  expect(row.textContent).not.toContain('Private foreign target');
  expect(row.textContent).not.toContain('/private-review');
  act(() => row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  const preview = document.querySelector<HTMLElement>(
    '[data-ui="content.design-review.feedback-preview"]'
  )!;
  expect(preview.textContent).not.toContain(entry.record.comment);
  expect(preview.textContent).not.toContain('private-foreign-path');
  expect(preview.cloneNode(true).textContent).not.toContain('private-foreign-path');
  const privateText = attachShadow.mock.results
    .flatMap((result) => (result.type === 'return' ? [result.value.textContent] : []))
    .join(' ');
  expect(privateText).toContain(entry.record.comment);
  expect(privateText).toContain('Private foreign target');
  expect(privateText).toContain('private-foreign-path');
  expect(
    attachShadow.mock.calls.every(
      ([options]) =>
        options.mode === 'closed' && options.clonable === false && options.serializable === false
    )
  ).toBe(true);
  vi.restoreAllMocks();
});

it('offers Resume while an empty active review has a saved session available', async () => {
  const runtime = configureSavedReview();
  review.snapshot = { ...review.snapshot!, active: true, available: true, records: [] };
  act(() =>
    root.render(
      <DesignReviewFeedbackPanel open onClose={vi.fn()} onOpenRecord={vi.fn(() => true)} />
    )
  );
  expect(
    container.querySelectorAll('[data-ui="content.design-review.feedback-item"]')
  ).toHaveLength(0);
  const resume = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'content.designReview.sessionResume'
  );
  expect(resume).toBeDefined();
  await act(async () => resume?.click());
  expect(runtime.resume).toHaveBeenCalledOnce();
});

it('rejects untrusted archive row and toolbar commands before they reach their actions', async () => {
  const runtime = configureSavedReview();
  review.snapshot = { ...review.snapshot!, canUndo: true };
  const render = () =>
    root.render(
      <DesignReviewFeedbackPanel open onClose={vi.fn()} onOpenRecord={vi.fn(() => true)} />
    );
  act(render);
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(false);
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[data-ui="content.design-review.feedback-item"] button')
      ?.click();
    container
      .querySelector<HTMLButtonElement>('[aria-label="content.designReview.panelDelete"]')
      ?.click();
    container
      .querySelector<HTMLButtonElement>('[aria-label="content.designReview.panelClearAll"]')
      ?.click();
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'content.designReview.panelUndoDelete')
      ?.click();
  });
  expect(runtime.openRecord).not.toHaveBeenCalled();
  expect(runtime.deleteRecord).not.toHaveBeenCalled();
  expect(runtime.undoDelete).not.toHaveBeenCalled();
  expect(runtime.clear).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull();
  review.snapshot = {
    ...review.snapshot!,
    active: false,
    available: true,
    records: [],
    canUndo: false,
  };
  act(render);
  await act(async () =>
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'content.designReview.sessionResume')
      ?.click()
  );
  expect(runtime.resume).not.toHaveBeenCalled();
});

it('rejects an untrusted clear confirmation in the portal after a trusted dialog open', async () => {
  const runtime = configureSavedReview();
  act(() =>
    root.render(
      <DesignReviewFeedbackPanel open onClose={vi.fn()} onOpenRecord={vi.fn(() => true)} />
    )
  );
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="content.designReview.panelClearAll"]')
      ?.click()
  );
  const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]');
  expect(dialog).not.toBeNull();
  const confirm = Array.from(dialog!.querySelectorAll('button')).find(
    (button) => button.textContent === 'content.designReview.panelClearAll'
  );
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(false);
  await act(async () => confirm?.click());
  expect(runtime.clear).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).not.toBeNull();
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(true);
  await act(async () => confirm?.click());
  expect(runtime.clear).toHaveBeenCalledOnce();
});

it('accepts the canonical private mouse bridge while rejecting unbranded script clicks', async () => {
  const runtime = configureSavedReview();
  act(() =>
    root.render(
      <DesignReviewFeedbackPanel open onClose={vi.fn()} onOpenRecord={vi.fn(() => true)} />
    )
  );
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(false);
  const open = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.design-review.feedback-item"] button'
  )!;
  const remove = container.querySelector<HTMLButtonElement>(
    '[aria-label="content.designReview.panelDelete"]'
  )!;
  await act(async () => {
    open.dispatchEvent(createBridgedMouseEvent('click', new MouseEvent('mouseup')));
  });
  expect(runtime.openRecord).toHaveBeenCalledWith('saved-entry');
  await act(async () => open.click());
  expect(runtime.openRecord).toHaveBeenCalledTimes(1);
  await act(async () => {
    remove.dispatchEvent(createBridgedMouseEvent('click', new MouseEvent('mouseup')));
  });
  expect(runtime.deleteRecord).toHaveBeenCalledWith('saved-entry');
  await act(async () => remove.click());
  expect(runtime.deleteRecord).toHaveBeenCalledTimes(1);
});
