// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_BLUR_CATEGORIES } from '../../../../features/highlighter/contracts/auto-blur';
import type { AutoBlurController } from '../controller';
import type { AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import { AutoBlurModal } from '.';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createMatch(overrides: Partial<AutoBlurMatch> = {}): AutoBlurMatch {
  return {
    alreadyBlurred: false,
    category: AUTO_BLUR_CATEGORIES.email,
    confidence: 0.95,
    element: document.createElement('span'),
    id: 'email-match',
    rect: { height: 16, width: 120, x: 10, y: 20 },
    value: 'john.doe@example.com',
    ...overrides,
  };
}

function createController(overrides: Partial<AutoBlurController> = {}): AutoBlurController {
  return {
    apply: vi.fn(async () => undefined),
    applyOnce: vi.fn(async () => undefined),
    autoApplyAllowed: true,
    autoApplyEnabled: false,
    blurSettings: {
      amount: 12,
      blurType: 'solid',
      showBorder: false,
    },
    close: vi.fn(),
    errorMessage: null,
    isApplying: false,
    isOpen: true,
    matches: [createMatch(), createMatch({ alreadyBlurred: true, id: 'blurred-match' })],
    open: vi.fn(),
    reset: vi.fn(),
    selectedCategories: new Set([AUTO_BLUR_CATEGORIES.email]),
    selectedMatchIds: new Set(),
    selectedTargetCount: 1,
    setBlurSettings: vi.fn(),
    status: 'ready',
    toggleAllSelection: vi.fn(),
    toggleAutoApply: vi.fn(async () => undefined),
    toggleCategory: vi.fn(),
    toggleMatch: vi.fn(),
    ...overrides,
  };
}

async function renderModal(controller: AutoBlurController) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<AutoBlurModal controller={controller} />);
  });
}

function clickButton(label: string) {
  const button = Array.from(container?.querySelectorAll('button') ?? []).find(
    (item) => item.textContent === label
  );
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function expectRowsAndFooterWired() {
  const controller = createController();
  await renderModal(controller);

  const rowCheckboxes = container?.querySelectorAll('[role="treegrid"] input[type="checkbox"]');
  expect(rowCheckboxes?.[0]).toHaveProperty('checked', true);
  expect(container?.textContent).toContain('john.doe@example.com');
  expect(container?.textContent).toContain('content.autoBlur.alreadyBlurred');
  expect(container?.textContent).not.toContain('content.autoBlur.readyStatus');

  clickButton('content.autoBlur.reset');
  clickButton('content.autoBlur.apply');
  clickButton('content.autoBlur.cancel');

  expect(controller.reset).toHaveBeenCalledTimes(1);
  expect(controller.apply).toHaveBeenCalledTimes(1);
  expect(controller.close).toHaveBeenCalledTimes(1);
}

async function expectTreeBulkActions() {
  const controller = createController({
    matches: [createMatch()],
  });
  await renderModal(controller);

  expect(container?.textContent).toContain('content.autoBlur.categoryDocumentNumber');
  clickButton('content.autoBlur.collapseAllButton');
  expect(container?.textContent).not.toContain('john.doe@example.com');

  clickButton('content.autoBlur.expandAllButton');
  clickButton('content.autoBlur.clearSelectionButton');

  expect(container?.textContent).toContain('john.doe@example.com');
  expect(controller.toggleAllSelection).toHaveBeenCalledTimes(1);
}

async function expectChildDeselection() {
  const controller = createController();
  await renderModal(controller);

  const emailCheckbox = Array.from(
    container?.querySelectorAll<HTMLInputElement>('[role="treegrid"] input[type="checkbox"]') ?? []
  ).find((checkbox) => checkbox.getAttribute('aria-label') === 'john.doe@example.com');
  emailCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  expect(controller.toggleMatch).toHaveBeenCalledWith('email-match');
}

async function expectEscapeClosesModal() {
  const controller = createController();
  await renderModal(controller);

  container
    ?.querySelector('[role="dialog"]')
    ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));

  expect(controller.close).toHaveBeenCalledTimes(1);
}

async function expectModalStates() {
  await renderModal(createController({ matches: [], status: 'loading' }));
  expect(container?.textContent).toContain('content.autoBlur.loading');

  await renderModal(createController({ matches: [], status: 'empty' }));
  expect(container?.textContent).toContain('content.autoBlur.empty');

  await renderModal(createController({ matches: [], status: 'error' }));
  expect(container?.textContent).toContain('content.autoBlur.scanError');
}

describe('AutoBlurModal', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
  });

  it('renders selectable rows, marks already blurred targets, and wires footer actions', async () => {
    await expectRowsAndFooterWired();
  });

  it('renders category parents for empty categories and exposes tree bulk actions', async () => {
    await expectTreeBulkActions();
  });

  it('allows a child row to be deselected when its category is selected', async () => {
    await expectChildDeselection();
  });

  it('closes on Escape when the modal is not applying', async () => {
    await expectEscapeClosesModal();
  });

  it('renders loading, empty, and failure states without table actions', async () => {
    await expectModalStates();
  });
});
