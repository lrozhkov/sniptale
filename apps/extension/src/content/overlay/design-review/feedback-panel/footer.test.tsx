// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReviewSessionState } from '../../../application/design-review-session/runtime';
import {
  annotationSnapshot,
  deferred,
  pageA,
  pageB,
  record,
  setup,
} from '../../../application/design-review-session/runtime.test-support';
import type { executeToolbarAnnotationExportAction } from '../../toolbar/design-review/export-actions';

const mocks = vi.hoisted(() => ({
  createIntentSource: vi.fn<() => { kind: 'trusted-content-event' } | null>(),
  executeAction: vi.fn<typeof executeToolbarAnnotationExportAction>(),
  showToast: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: mocks.showToast,
}));
vi.mock('../../../application/privileged-action-intent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/privileged-action-intent')>()),
  createTrustedContentActionIntentSource: mocks.createIntentSource,
}));
vi.mock('../../toolbar/design-review/export-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../toolbar/design-review/export-actions')>()),
  executeToolbarAnnotationExportAction: mocks.executeAction,
}));

import { FeedbackPanelFooter } from './footer';

const actions = [
  ['download', 'Download', '.lucide-download'],
  ['pdf', 'Pdf', '.lucide-file-down'],
  ['copy', 'Copy', '.lucide-copy'],
] as const;
let container: HTMLDivElement;
let root: Root;
let fixture: ReturnType<typeof setup>;
let session: ReviewSessionState;

function renderFooter(
  options: { recordCount?: number; withoutRuntime?: boolean; onClear?: () => void } = {}
) {
  act(() => {
    root.render(
      <FeedbackPanelFooter
        runtime={options.withoutRuntime ? null : fixture.runtime}
        session={options.withoutRuntime ? null : session}
        recordCount={options.recordCount ?? 2}
        {...(options.onClear ? { onClear: options.onClear } : {})}
      />
    );
  });
}

function exportButton(action: (typeof actions)[number][0]) {
  const button = container.querySelector<HTMLButtonElement>(
    `[data-ui="content.design-review.feedback-export.${action}"]`
  );
  if (!button) throw new Error(`Missing ${action} report action`);
  return button;
}

function undoButton() {
  return container.querySelector<HTMLButtonElement>(
    '[aria-label="content.designReview.panelUndoDelete"]'
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.createIntentSource.mockReset();
  mocks.createIntentSource.mockReturnValue({ kind: 'trusted-content-event' });
  mocks.executeAction.mockReset();
  mocks.executeAction.mockResolvedValue(undefined);
  mocks.showToast.mockReset();
  fixture = setup();
  session = { ...fixture.runtime.getSnapshot(), active: true, records: fixture.initial.entries };
  vi.spyOn(fixture.runtime, 'getSnapshot').mockImplementation(() => session);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  fixture.runtime.dispose();
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps the footer mounted with three ordered, named report actions when feedback is empty', () => {
  renderFooter({ recordCount: 0, withoutRuntime: true });
  const footer = container.querySelector('footer');
  expect(footer?.dataset['ui']).toBe('content.design-review.feedback-footer');
  expect(footer?.classList.contains('h-10')).toBe(true);
  expect(footer?.classList.contains('shrink-0')).toBe(true);
  expect(
    Array.from(footer?.querySelectorAll('button') ?? [], (button) => button.dataset['ui'])
  ).toEqual(actions.map(([action]) => `content.design-review.feedback-export.${action}`));
  for (const [action, label, icon] of actions) {
    const button = exportButton(action);
    expect(button.getAttribute('aria-label')).toBe(`content.toolbar.annotationExport${label}Label`);
    expect(button.title).toBe(button.getAttribute('aria-label'));
    expect(button.textContent).toBe(
      action === 'copy' ? `content.toolbar.annotationExport${label}Label` : ''
    );
    expect(button.querySelector(icon)?.getAttribute('aria-hidden')).toBe('true');
    expect(button.disabled).toBe(true);
    act(() => button.click());
  }
  expect(undoButton()).toBeNull();
  expect(mocks.createIntentSource).not.toHaveBeenCalled();
  expect(mocks.executeAction).not.toHaveBeenCalled();
});

it.each(actions)(
  'runs the %s command with the active aggregate session snapshot',
  async (action, label) => {
    const aggregate = {
      snapshot: annotationSnapshot([record(pageA), { ...record(pageB), annotationId: 2 }]),
      previews: new Map(),
    };
    const snapshot = vi.spyOn(fixture.runtime, 'exportSnapshot').mockReturnValue(aggregate);
    mocks.executeAction.mockImplementation(async (_action, _source, captureSnapshot) => {
      expect(captureSnapshot?.()).toBe(aggregate);
    });
    renderFooter();
    await act(async () => exportButton(action).click());
    expect(mocks.createIntentSource).toHaveBeenCalledWith(expect.any(MouseEvent));
    expect(mocks.executeAction).toHaveBeenCalledExactlyOnceWith(
      action,
      { kind: 'trusted-content-event' },
      snapshot
    );
    expect(snapshot).toHaveBeenCalledOnce();
    expect(aggregate.snapshot.domRecords.map((entry) => entry.evidence.pageUrl)).toEqual([
      pageA,
      pageB,
    ]);
    expect(mocks.showToast).toHaveBeenCalledWith(
      `content.toolbar.annotationExport${label}${action === 'pdf' ? 'Opened' : 'Success'}`,
      'success'
    );
    expect(exportButton(action).disabled).toBe(false);
  }
);

it.each([false, true])(
  'uses the document fallback when runtime is absent: %s',
  async (withoutRuntime) => {
    session = { ...session, active: false };
    const snapshot = vi.spyOn(fixture.runtime, 'exportSnapshot');
    renderFooter({ withoutRuntime });
    await act(async () => exportButton('copy').click());
    expect(mocks.executeAction).toHaveBeenCalledExactlyOnceWith(
      'copy',
      { kind: 'trusted-content-event' },
      undefined
    );
    expect(snapshot).not.toHaveBeenCalled();
  }
);

it.each(actions)(
  'refuses %s without a trusted action intent and leaves controls usable',
  (action) => {
    mocks.createIntentSource.mockReturnValue(null);
    renderFooter();
    act(() => exportButton(action).click());
    expect(mocks.executeAction).not.toHaveBeenCalled();
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(exportButton(action).disabled).toBe(false);
    expect(exportButton(action).getAttribute('aria-busy')).toBe('false');
  }
);

it('disables Clear, report and Undo actions during pending session work', () => {
  session = { ...session, pending: true, canUndo: true };
  const undo = vi.spyOn(fixture.runtime, 'undoDelete').mockResolvedValue(undefined);
  const clear = vi.fn();
  renderFooter({ onClear: clear });
  const clearButton = container.querySelector<HTMLButtonElement>(
    '[aria-label="content.designReview.panelClearAll"]'
  )!;
  expect(clearButton.disabled).toBe(true);
  act(() => clearButton.click());
  expect(clear).not.toHaveBeenCalled();
  for (const [action] of actions) {
    expect(exportButton(action).disabled).toBe(true);
    act(() => exportButton(action).click());
  }
  expect(undoButton()?.disabled).toBe(true);
  act(() => undoButton()?.click());
  expect(undo).not.toHaveBeenCalled();
  expect(mocks.executeAction).not.toHaveBeenCalled();
});

it('rejects duplicate clicks before React commits and disables all controls until export settles', async () => {
  session = { ...session, canUndo: true };
  const completion = deferred<void>();
  mocks.executeAction.mockReturnValue(completion.promise);
  const undo = vi.spyOn(fixture.runtime, 'undoDelete').mockResolvedValue(undefined);
  const clear = vi.fn();
  renderFooter({ onClear: clear });
  const clearButton = container.querySelector<HTMLButtonElement>(
    '[aria-label="content.designReview.panelClearAll"]'
  )!;
  act(() => {
    exportButton('download').click();
    exportButton('download').click();
    exportButton('copy').click();
  });
  expect(mocks.executeAction).toHaveBeenCalledOnce();
  expect(mocks.createIntentSource).toHaveBeenCalledOnce();
  expect(exportButton('download').getAttribute('aria-busy')).toBe('true');
  expect(exportButton('download').querySelector('.animate-spin')).not.toBeNull();
  for (const [action] of actions) expect(exportButton(action).disabled).toBe(true);
  expect(undoButton()?.disabled).toBe(true);
  expect(clearButton.disabled).toBe(true);
  act(() => {
    undoButton()?.click();
    clearButton.click();
  });
  expect(undo).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
  await act(async () => completion.resolve());
  expect(clearButton.disabled).toBe(false);
  for (const [action] of actions) expect(exportButton(action).disabled).toBe(false);
  expect(undoButton()?.disabled).toBe(false);
  expect(exportButton('download').getAttribute('aria-busy')).toBe('false');
});

it.each(['rejected promise', 'synchronous throw'])(
  'keeps feedback and enables retry after a %s',
  async (failure) => {
    const feedback = [...session.records];
    if (failure === 'synchronous throw') {
      mocks.executeAction.mockImplementationOnce(() => {
        throw new Error('Export failed');
      });
    } else {
      mocks.executeAction.mockRejectedValueOnce(new Error('Export failed'));
    }
    const clear = vi.spyOn(fixture.runtime, 'clear').mockResolvedValue(undefined);
    renderFooter();
    await act(async () => exportButton('copy').click());
    expect(mocks.showToast).toHaveBeenCalledWith(
      'content.toolbar.annotationExportCopyError',
      'error'
    );
    expect(exportButton('copy').querySelector('.lucide-check')).toBeNull();
    expect(exportButton('copy').querySelector('.lucide-copy')).not.toBeNull();
    expect(session.records).toEqual(feedback);
    expect(clear).not.toHaveBeenCalled();
    expect(container.querySelector('footer')).not.toBeNull();
    for (const [action] of actions) expect(exportButton(action).disabled).toBe(false);
    await act(async () => exportButton('copy').click());
    expect(mocks.executeAction).toHaveBeenCalledTimes(2);
    expect(mocks.showToast).toHaveBeenLastCalledWith(
      'content.toolbar.annotationExportCopySuccess',
      'success'
    );
  }
);

it('shows icon-only Undo when deletion is available and keeps the same footer after restoration', async () => {
  renderFooter();
  const footer = container.querySelector('footer');
  expect(undoButton()).toBeNull();
  session = { ...session, canUndo: true };
  renderFooter({ recordCount: 0 });
  const undo = undoButton();
  expect(undo?.title).toBe('content.designReview.panelUndoDelete');
  expect(undo?.textContent).toBe('');
  expect(undo?.querySelector('.lucide-undo-2')?.getAttribute('aria-hidden')).toBe('true');
  expect(undo?.disabled).toBe(false);
  const restore = vi.spyOn(fixture.runtime, 'undoDelete').mockImplementation(async () => {
    session = { ...session, canUndo: false };
  });
  await act(async () => undo?.click());
  expect(restore).toHaveBeenCalledOnce();
  renderFooter();
  expect(undoButton()).toBeNull();
  expect(container.querySelector('footer')).toBe(footer);
  expect(
    container.querySelectorAll('[data-ui^="content.design-review.feedback-export."]')
  ).toHaveLength(3);
});

it('places Clear before dynamic Undo and calls only the supplied confirmation callback', () => {
  const clear = vi.fn();
  const runtimeClear = vi.spyOn(fixture.runtime, 'clear');
  session = { ...session, canUndo: true };
  renderFooter({ onClear: clear });
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('footer button'));
  expect(buttons[0]?.getAttribute('aria-label')).toBe('content.designReview.panelClearAll');
  expect(buttons[0]?.querySelector('.lucide-brush-cleaning')).not.toBeNull();
  expect(buttons[1]).toBe(undoButton());
  act(() => buttons[0]?.click());
  expect(clear).toHaveBeenCalledOnce();
  expect(runtimeClear).not.toHaveBeenCalled();
  session = { ...session, canUndo: false };
  renderFooter({ onClear: clear });
  expect(container.querySelector('footer button')).toBe(buttons[0]);
  expect(undoButton()).toBeNull();
});

it('shows Check only after copy succeeds and restores Copy after two seconds without changing its label', async () => {
  vi.useFakeTimers();
  const completion = deferred<void>();
  mocks.executeAction.mockReturnValueOnce(completion.promise);
  renderFooter();
  const copy = exportButton('copy');
  const label = copy.textContent;
  act(() => copy.click());
  expect(copy.querySelector('.lucide-check')).toBeNull();
  await act(async () => completion.resolve());
  expect(copy.querySelector('.lucide-check')).not.toBeNull();
  expect(copy.textContent).toBe(label);
  act(() => vi.advanceTimersByTime(1999));
  expect(copy.querySelector('.lucide-check')).not.toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(copy.querySelector('.lucide-copy')).not.toBeNull();
  expect(copy.querySelector('.lucide-check')).toBeNull();
  expect(copy.textContent).toBe(label);
});

it('restarts copied feedback after another successful copy and cancels its timer on unmount', async () => {
  vi.useFakeTimers();
  renderFooter();
  await act(async () => exportButton('copy').click());
  act(() => vi.advanceTimersByTime(1500));
  const completion = deferred<void>();
  mocks.executeAction.mockReturnValueOnce(completion.promise);
  act(() => exportButton('copy').click());
  expect(exportButton('copy').querySelector('.lucide-check')).toBeNull();
  await act(async () => completion.resolve());
  act(() => vi.advanceTimersByTime(500));
  expect(exportButton('copy').querySelector('.lucide-check')).not.toBeNull();
  act(() => vi.advanceTimersByTime(1499));
  expect(exportButton('copy').querySelector('.lucide-check')).not.toBeNull();
  act(() => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(1));
  expect(container.querySelector('footer')).toBeNull();
});

it('removes previous copied feedback when the next copy fails and permits another retry', async () => {
  vi.useFakeTimers();
  renderFooter();
  await act(async () => exportButton('copy').click());
  expect(exportButton('copy').querySelector('.lucide-check')).not.toBeNull();
  mocks.executeAction.mockRejectedValueOnce(new Error('Copy failed'));
  await act(async () => exportButton('copy').click());
  expect(exportButton('copy').querySelector('.lucide-check')).toBeNull();
  expect(exportButton('copy').querySelector('.lucide-copy')).not.toBeNull();
  expect(exportButton('copy').disabled).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => exportButton('copy').click());
  expect(exportButton('copy').querySelector('.lucide-check')).not.toBeNull();
});

it('restarts the confirmation timer for immediately completed repeat copies', async () => {
  vi.useFakeTimers();
  renderFooter();
  await act(async () => exportButton('copy').click());
  act(() => vi.advanceTimersByTime(1500));
  await act(async () => exportButton('copy').click());
  act(() => vi.advanceTimersByTime(500));
  expect(exportButton('copy').querySelector('.lucide-check')).not.toBeNull();
  act(() => vi.advanceTimersByTime(1499));
  expect(exportButton('copy').querySelector('.lucide-check')).not.toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(exportButton('copy').querySelector('.lucide-check')).toBeNull();
});
