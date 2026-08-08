// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
    pageUrl: 'https://example.test/home',
    targetPath: `html > body > ${selector}`,
    targetSelector: selector,
    targetText: 'Save changes',
    viewport: { height: 720, width: 1280 },
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
  expect(
    container.querySelector('[data-ui="content.design-review.feedback-preview"]')
  ).not.toBeNull();

  act(() => (items[0] as HTMLButtonElement).click());
  expect(onOpenRecord).toHaveBeenCalledWith(1);
  expect(container.querySelector('[data-ui="content.design-review.feedback-preview"]')).toBeNull();

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

it('defers Escape to an open popover action menu before closing the feedback panel', async () => {
  const onClose = vi.fn();
  act(() => {
    root.render(
      <>
        <DesignReviewFeedbackPanel onClose={onClose} onOpenRecord={vi.fn(() => true)} open />
        <DesignReviewActionMenu action="refine" onSelect={vi.fn()} />
      </>
    );
  });
  const actionTrigger = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.includes('content.designReview.actionRefine')
  );
  if (!actionTrigger) throw new Error('Expected Design Review action trigger');
  act(() => actionTrigger.click());
  expect(container.querySelector('[data-ui="content.design-review.action-menu"]')).not.toBeNull();

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }));
  });
  expect(container.querySelector('[data-ui="content.design-review.action-menu"]')).toBeNull();
  expect(onClose).not.toHaveBeenCalled();

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
