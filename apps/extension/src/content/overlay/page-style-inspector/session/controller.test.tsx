// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleAssetReference,
  type PageStylePatch,
  type PageStyleRestoreRule,
  type PageStyleTemplate,
} from '@sniptale/runtime-contracts/page-style';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { PageStyleCommentField } from '../property-controls/comment';
import { usePageStyleInspectorController } from './controller';

const mocks = vi.hoisted(() => ({
  applyPageStylePatchWithHistory: vi.fn(),
  applyPageStyleRestoreRuleWithHistory: vi.fn(),
  deletePageStyleRestoreRuleAndCleanupAssets: vi.fn(),
  deletePageStyleTemplate: vi.fn(),
  listPageStyleRestoreRules: vi.fn(),
  listPageStyleTemplates: vi.fn(),
  savePageStyleRestoreRule: vi.fn(),
  savePageStyleTemplate: vi.fn(),
  setPageStyleRestoreRuleEnabled: vi.fn(),
  summarizePageStyleRulesForPage: vi.fn(),
}));

const trustedEventMocks = vi.hoisted(() => ({
  isTrustedMouseEvent: vi.fn(() => true),
}));

const commentMocks = vi.hoisted(() => ({
  commit: vi.fn(() => 1),
  read: vi.fn(() => ({ comment: '', marker: null })),
}));

vi.mock('../../../../composition/persistence/page-style/storage', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/page-style/storage')
  >()),
  listPageStyleRestoreRules: mocks.listPageStyleRestoreRules,
  listPageStyleTemplates: mocks.listPageStyleTemplates,
  savePageStyleRestoreRule: mocks.savePageStyleRestoreRule,
  savePageStyleTemplate: mocks.savePageStyleTemplate,
  setPageStyleRestoreRuleEnabled: mocks.setPageStyleRestoreRuleEnabled,
  summarizePageStyleRulesForPage: mocks.summarizePageStyleRulesForPage,
}));

vi.mock('../../../../composition/persistence/page-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/page-style')>()),
  deletePageStyleRestoreRuleAndCleanupAssets: mocks.deletePageStyleRestoreRuleAndCleanupAssets,
  deletePageStyleTemplate: mocks.deletePageStyleTemplate,
}));

vi.mock('../runtime/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/actions')>()),
  appendPageStyleImageAsset: vi.fn(
    (args: { asset: PageStyleAssetReference; patch: PageStylePatch }) => ({
      assets: [...args.patch.assets.filter((item) => item.kind !== args.asset.kind), args.asset],
      declarations: args.patch.declarations,
    })
  ),
  applyPageStylePatchWithHistory: mocks.applyPageStylePatchWithHistory,
  applyPageStyleRestoreRuleWithHistory: mocks.applyPageStyleRestoreRuleWithHistory,
  createExactPageStyleScope: vi.fn(() => ({
    active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
    domain: window.location.hostname || null,
    exactAddress: window.location.href,
  })),
  readCurrentPageStyleIdentity: vi.fn(() => ({
    pageDomain: window.location.hostname || null,
    pageUrl: window.location.href,
  })),
  savePageStyleImageAsset: vi.fn(),
}));

vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/trusted-events')>()),
  isTrustedMouseEvent: trustedEventMocks.isTrustedMouseEvent,
}));

vi.mock('../runtime/comment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/comment')>()),
  commitPropertiesComment: commentMocks.commit,
  readPropertiesComment: commentMocks.read,
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: ReturnType<typeof usePageStyleInspectorController> | null = null;

function createRule(id: string, exactAddress = window.location.href): PageStyleRestoreRule {
  return {
    createdAt: 1,
    enabled: true,
    id,
    name: id,
    patch: { assets: [], declarations: [{ property: 'color', value: '#111111' }] },
    propertySummary: ['color'],
    scope: {
      active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
      exactAddress,
    },
    selector: { locator: `#${id}` },
    updatedAt: 1,
  };
}

function createTemplate(): PageStyleTemplate {
  return {
    createdAt: 1,
    id: 'template-1',
    name: 'Template',
    patch: { assets: [], declarations: [{ property: 'width', value: '120px' }] },
    propertySummary: ['width'],
    updatedAt: 1,
  };
}

function Harness(props: {
  quickEditDocumentMode?: boolean;
  quickEditMode?: boolean;
  renderCommentControls?: boolean;
}) {
  const controller = usePageStyleInspectorController({
    quickEditDocumentMode: props.quickEditDocumentMode ?? false,
    quickEditMode: props.quickEditMode ?? true,
  });
  latest = controller;
  return props.renderCommentControls && controller.inspectorOpen ? (
    <>
      <PageStyleCommentField
        actions={controller.actions.comment}
        disabled={!controller.viewState.selection}
        state={controller.viewState.comment}
      />
      <button
        data-testid="close-comment-inspector"
        onClick={controller.actions.close}
        type="button"
      >
        Close
      </button>
    </>
  ) : null;
}

async function renderHarness(props: Parameters<typeof Harness>[0] = {}) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(<Harness {...props} />);
  });
}

async function rerenderHarness(props: Parameters<typeof Harness>[0]): Promise<void> {
  await act(async () => {
    root?.render(<Harness {...props} />);
  });
}

async function openInspector() {
  await act(async () => {
    latest?.toggleInspector();
  });
}

async function selectElement(element: HTMLElement) {
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

  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  trustedEventMocks.isTrustedMouseEvent.mockReturnValue(true);
  mocks.applyPageStylePatchWithHistory.mockResolvedValue(undefined);
  mocks.applyPageStyleRestoreRuleWithHistory.mockResolvedValue(true);
  mocks.listPageStyleTemplates.mockResolvedValue([createTemplate()]);
  mocks.listPageStyleRestoreRules.mockResolvedValue([createRule('matched'), createRule('other')]);
  mocks.summarizePageStyleRulesForPage.mockResolvedValue({
    activeAppliedCount: 1,
    matchedRules: [
      {
        enabled: true,
        id: 'matched',
        name: 'matched',
        propertySummary: ['color'],
        scope: {
          active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
          exactAddress: window.location.href,
        },
      },
    ],
    pageUrl: window.location.href,
  });
  mocks.savePageStyleRestoreRule.mockResolvedValue(createRule('saved'));
  mocks.savePageStyleTemplate.mockResolvedValue(createTemplate());
  mocks.deletePageStyleRestoreRuleAndCleanupAssets.mockResolvedValue({
    cleanupFailedAssetIds: [],
    deleted: true,
  });
  mocks.deletePageStyleTemplate.mockResolvedValue(true);
  mocks.setPageStyleRestoreRuleEnabled.mockResolvedValue(true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  latest = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('keeps empty state read-only and filters current-page rules by summary ids', async () => {
  await renderHarness();
  await openInspector();

  expect(latest?.inspectorOpen).toBe(true);
  expect(latest?.viewState.selection).toBeNull();
  expect(latest?.viewState.rules.map((rule) => rule.id)).toEqual(['matched', 'other']);

  await act(async () => {
    await latest?.actions.saveTemplate();
    await latest?.actions.saveRule();
  });

  expect(mocks.savePageStyleTemplate).not.toHaveBeenCalled();
  expect(mocks.savePageStyleRestoreRule).not.toHaveBeenCalled();
});

it('selects inspectable page blocks and saves templates from the current normalized patch', async () => {
  await renderHarness();
  const target = document.createElement('p');
  target.id = 'selected';
  target.textContent = 'Selected text';
  target.style.color = 'rgb(17, 17, 17)';
  document.body.append(target);

  await openInspector();
  await selectElement(target);

  expect(latest?.viewState.selection?.tagName).toBe('p');

  await act(async () => {
    await latest?.actions.saveTemplate();
  });

  expect(mocks.savePageStyleTemplate).toHaveBeenCalledWith(
    expect.objectContaining({ patch: { assets: [], declarations: [] } })
  );
});

it('selects image targets without reacting to content-owned inspector controls', async () => {
  await renderHarness();
  const image = document.createElement('img');
  image.id = 'selected-image';
  image.src = 'https://example.com/image.png';
  document.body.append(image);
  const contentControl = document.createElement('button');
  contentControl.textContent = 'Inspector button';
  const shadowRoot = document.createElement('div');
  shadowRoot.id = CONTENT_ROOT_ID;
  document.body.append(shadowRoot);
  shadowRoot.attachShadow({ mode: 'open' }).append(contentControl);

  await openInspector();
  await selectElement(contentControl);
  expect(latest?.viewState.selection).toBeNull();

  await selectElement(image);

  expect(latest?.viewState.selection?.kind).toBe('image');
  expect(latest?.viewState.selection?.tagName).toBe('img');
});

it('saves exact-page restore rules with content opt-ins disabled by default', async () => {
  await renderHarness();
  const target = document.createElement('p');
  target.id = 'rule-target';
  target.textContent = 'Do not retain by default';
  document.body.append(target);

  await openInspector();
  await selectElement(target);

  await act(async () => {
    await latest?.actions.saveRule();
  });

  expect(mocks.savePageStyleRestoreRule).toHaveBeenCalledWith(
    expect.not.objectContaining({ contentRetention: expect.anything() })
  );
  expect(mocks.savePageStyleRestoreRule).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: expect.objectContaining({ active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS }),
      selector: expect.objectContaining({ locator: '#rule-target' }),
    })
  );
});

it('adds text retention only after the user opts in for the selected rule', async () => {
  await renderHarness();
  const target = document.createElement('p');
  target.id = 'retained';
  target.textContent = 'Retained text';
  document.body.append(target);

  await openInspector();
  await selectElement(target);
  await act(async () => {
    latest?.actions.setRetainText(true);
  });
  await act(async () => {
    await latest?.actions.saveRule();
  });

  expect(mocks.savePageStyleRestoreRule).toHaveBeenCalledWith(
    expect.objectContaining({
      contentRetention: { text: { enabled: true, text: 'Retained text' } },
    })
  );
});

it('commits a changed comment before closing the inspector', async () => {
  await renderHarness();
  const target = document.createElement('p');
  target.id = 'comment-target';
  document.body.append(target);
  await openInspector();
  await selectElement(target);

  await act(async () => {
    latest?.actions.comment.updateDraft('Controller comment');
    latest?.actions.close();
  });

  expect(commentMocks.commit).toHaveBeenCalledTimes(1);
  expect(commentMocks.commit).toHaveBeenCalledWith(
    expect.objectContaining({ comment: 'Controller comment', target })
  );
  expect(latest?.inspectorOpen).toBe(false);
});

it('commits a changed comment once when the active Quick Edit mode closes the inspector', async () => {
  await renderHarness({ quickEditMode: true });
  const target = document.createElement('p');
  target.id = 'mode-close-comment-target';
  document.body.append(target);
  await openInspector();
  await selectElement(target);

  act(() => latest?.actions.comment.updateDraft('Commit on mode close'));
  await rerenderHarness({ quickEditMode: false });
  await rerenderHarness({ quickEditMode: false });

  expect(commentMocks.commit).toHaveBeenCalledTimes(1);
  expect(commentMocks.commit).toHaveBeenCalledWith(
    expect.objectContaining({ comment: 'Commit on mode close', target })
  );
  expect(latest?.inspectorOpen).toBe(false);
});

it('finalizes an active IME draft once when Quick Edit mode closes externally', async () => {
  await renderHarness({ quickEditMode: true });
  const target = document.createElement('p');
  target.id = 'ime-mode-close-target';
  document.body.append(target);
  await openInspector();
  await selectElement(target);

  act(() => {
    latest?.actions.comment.startComposition();
    latest?.actions.comment.updateDraft('IME terminal draft');
  });
  expect(commentMocks.commit).not.toHaveBeenCalled();

  await rerenderHarness({ quickEditMode: false });
  await rerenderHarness({ quickEditMode: false });

  expect(commentMocks.commit).toHaveBeenCalledTimes(1);
  expect(commentMocks.commit).toHaveBeenCalledWith(
    expect.objectContaining({ comment: 'IME terminal draft', target })
  );
});

it('does not retry a failed textarea blur during the same pointer close gesture', async () => {
  commentMocks.commit.mockImplementationOnce(() => {
    throw new Error('blur failed');
  });
  await renderHarness({ quickEditMode: true, renderCommentControls: true });
  const target = document.createElement('p');
  target.id = 'blur-close-target';
  document.body.append(target);
  await openInspector();
  await selectElement(target);
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea')!;
  const closeButton = document.querySelector<HTMLButtonElement>(
    '[data-testid="close-comment-inspector"]'
  )!;

  act(() => {
    textarea.focus();
    setTextareaValue(textarea, 'One failed gesture');
  });
  act(() => {
    textarea.blur();
    closeButton.click();
  });

  expect(commentMocks.commit).toHaveBeenCalledTimes(1);
  expect(latest?.inspectorOpen).toBe(true);
  expect(latest?.viewState.comment).toMatchObject({
    commitFailed: true,
    draft: 'One failed gesture',
  });

  const retryTextarea = document.querySelector<HTMLTextAreaElement>('textarea')!;
  act(() => {
    retryTextarea.focus();
    retryTextarea.blur();
  });
  expect(commentMocks.commit).toHaveBeenCalledTimes(2);
});

it('uses one terminal producer call for active IME blur plus explicit pointer close', async () => {
  await renderHarness({ quickEditMode: true, renderCommentControls: true });
  const target = document.createElement('p');
  target.id = 'ime-pointer-close-target';
  document.body.append(target);
  await openInspector();
  await selectElement(target);
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea')!;
  const closeButton = document.querySelector<HTMLButtonElement>(
    '[data-testid="close-comment-inspector"]'
  )!;

  act(() => {
    textarea.focus();
    textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    setTextareaValue(textarea, 'IME pointer close');
  });
  expect(commentMocks.commit).not.toHaveBeenCalled();
  act(() => {
    textarea.blur();
    closeButton.click();
  });

  expect(commentMocks.commit).toHaveBeenCalledTimes(1);
  expect(commentMocks.commit).toHaveBeenCalledWith(
    expect.objectContaining({ comment: 'IME pointer close', target })
  );
  expect(latest?.inspectorOpen).toBe(false);
});
