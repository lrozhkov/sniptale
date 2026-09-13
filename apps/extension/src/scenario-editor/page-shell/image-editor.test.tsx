// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_BROWSER_FRAME_STATE,
} from '../../features/editor/document/constants';
const io = vi.hoisted(() => ({ prepare: vi.fn(), apply: vi.fn(), close: vi.fn() }));
vi.mock('../../workflows/scenario-capture-edit/source', () => ({
  prepareScenarioImageEditorPayload: io.prepare,
}));
vi.mock('../../platform/navigation/extension-pages', () => ({
  buildScenarioImageEditorUrl: (id: string) => `/editor?embed=scenario&embedSession=${id}`,
}));
vi.mock('../../workflows/scenario-capture-edit/tour-source', () => ({
  prepareTourImageEditorPayload: io.prepare,
}));
import { GuideImageEditor, TourImageEditor } from './image-editor';
let root: Root;
let host: HTMLDivElement;
const target = {
  projectId: 'guide',
  itemId: 'step',
  blockId: 'image',
  assetId: 'asset',
  editDocumentId: null,
};
const payload = { dataUrl: 'data:image/png;base64,abc', title: 'Image' };
const editorDocument = {
  version: 2 as const,
  sourceImageData: payload.dataUrl,
  sourceName: null,
  sourceWidth: 320,
  sourceHeight: 180,
  canvasWidth: 320,
  canvasHeight: 180,
  sourceLeft: 0,
  sourceTop: 0,
  sourceDisplayWidth: 320,
  sourceDisplayHeight: 180,
  frame: DEFAULT_EDITOR_FRAME_SETTINGS,
  browserFrame: DEFAULT_BROWSER_FRAME_STATE,
  canvasJson: '{"version":"7.2.0","objects":[]}',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  io.prepare.mockResolvedValue({ target, payload });
  io.apply.mockResolvedValue(true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () =>
    root.render(
      <GuideImageEditor
        project={createGuideProject('Guide', 'guide', 100)}
        itemId="step"
        blockId="image"
        onApply={io.apply}
        onClose={io.close}
        t={createTranslator('en')}
      />
    )
  );
}
function frame() {
  const element = host.querySelector('iframe');
  if (!element?.contentWindow) throw new Error('Missing iframe');
  return {
    element,
    child: element.contentWindow,
    id: new URL(element.src).searchParams.get('embedSession'),
  };
}
async function send(
  type: string,
  fields: Record<string, unknown> = {},
  source?: Window,
  origin = window.location.origin
) {
  const current = frame();
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: source ?? current.child,
        origin,
        data: { source: 'sniptale-editor-embed', sessionId: current.id, type, ...fields },
      })
    )
  );
}
it('binds initialization and apply to the exact iframe session and suppresses duplicate application', async () => {
  await render();
  const childPost = vi.spyOn(frame().child, 'postMessage').mockImplementation(() => undefined);
  await send('scenario-ready', {}, window);
  await send('scenario-ready', {}, undefined, 'https://foreign.test');
  await send('scenario-ready', { sessionId: 'stale' });
  expect(childPost).not.toHaveBeenCalled();
  await send('scenario-ready');
  expect(host.querySelector('header')).toBeNull();
  expect(host.querySelector('.guide-image-editor-feedback')).toBeNull();
  await send('scenario-ready');
  expect(childPost).toHaveBeenCalledOnce();
  expect(childPost).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'scenario-init', payload }),
    window.location.origin
  );
  let accept!: (value: boolean) => void;
  io.apply.mockReturnValue(
    new Promise<boolean>((resolve) => {
      accept = resolve;
    })
  );
  await send('scenario-apply', { dataUrl: payload.dataUrl, document: editorDocument });
  await send('scenario-apply', { dataUrl: payload.dataUrl, document: editorDocument });
  await send('scenario-close');
  expect(io.apply).toHaveBeenCalledOnce();
  expect(io.apply).toHaveBeenCalledWith({
    target,
    dataUrl: payload.dataUrl,
    document: editorDocument,
  });
  expect(io.close).not.toHaveBeenCalled();
  await act(async () => accept(true));
  expect(io.close).toHaveBeenCalledOnce();
});
it('keeps the same editor on apply failure and permits an explicit retry', async () => {
  await render();
  const original = frame().element;
  await send('scenario-ready');
  io.apply.mockResolvedValueOnce(false);
  await send('scenario-apply', { dataUrl: payload.dataUrl, document: editorDocument });
  expect(frame().element).toBe(original);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Your edits remain');
  expect(io.close).not.toHaveBeenCalled();
  await send('scenario-apply', { dataUrl: payload.dataUrl, document: editorDocument });
  expect(io.close).toHaveBeenCalledOnce();
});
it('cancels without publication and drops a late source acquisition', async () => {
  let resolve!: (value: unknown) => void;
  io.prepare.mockReturnValue(
    new Promise((accept) => {
      resolve = accept;
    })
  );
  await render();
  await act(async () => host.querySelector('button')?.click());
  expect(io.close).toHaveBeenCalledOnce();
  expect(io.apply).not.toHaveBeenCalled();
  await act(async () => root.render(null));
  await act(async () => resolve({ target, payload }));
  expect(host.querySelector('iframe')).toBeNull();
});
it('retries source load failures with a new disposable session', async () => {
  io.prepare.mockRejectedValueOnce(new Error('private storage error'));
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not open');
  expect(host.textContent).not.toContain('private storage');
  const retry = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'Retry loading'
  );
  await act(async () => retry?.click());
  expect(host.querySelector('iframe')).not.toBeNull();
  expect(io.apply).not.toHaveBeenCalled();
});
it('offers retry if the iframe never initializes and ignores its late response', async () => {
  vi.useFakeTimers();
  try {
    await render();
    await act(async () => vi.advanceTimersByTime(15_000));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not open');
    await send('scenario-ready');
    await send('scenario-apply', { dataUrl: payload.dataUrl, document: editorDocument });
    expect(io.apply).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

async function renderTour() {
  await act(async () =>
    root.render(
      <TourImageEditor
        project={createGuideProject('Guide', 'guide', 100)}
        slideId="slide"
        onApply={io.apply}
        onClose={io.close}
        t={createTranslator('en')}
      />
    )
  );
  await send('scenario-ready');
}
it('requires host confirmation for ambiguous tour geometry and retains the same editor on cancellation', async () => {
  await renderTour();
  const original = frame().element;
  io.apply.mockResolvedValueOnce('requires-target-review');
  await send('scenario-apply', {
    dataUrl: payload.dataUrl,
    document: editorDocument,
    allowTargetReview: true,
  });
  expect(io.apply).toHaveBeenLastCalledWith({
    target,
    dataUrl: payload.dataUrl,
    document: editorDocument,
    allowTargetReview: false,
  });
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  await send('scenario-close');
  await send('scenario-apply', { dataUrl: payload.dataUrl, document: editorDocument });
  expect(io.apply).toHaveBeenCalledOnce();
  expect(io.close).not.toHaveBeenCalled();
  const cancel = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Keep editing'
  );
  await act(async () => cancel?.click());
  expect(frame().element).toBe(original);
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  io.apply.mockResolvedValueOnce('requires-target-review');
  await send('scenario-apply', { dataUrl: payload.dataUrl, document: editorDocument });
  const confirm = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Apply and review'
  );
  await act(async () => confirm?.click());
  expect(io.apply).toHaveBeenLastCalledWith({
    target,
    dataUrl: payload.dataUrl,
    document: editorDocument,
    allowTargetReview: true,
  });
  expect(io.close).toHaveBeenCalledOnce();
});
it('disposes a pending tour review when leaving the image session', async () => {
  await renderTour();
  io.apply.mockResolvedValueOnce('requires-target-review');
  await send('scenario-apply', { dataUrl: payload.dataUrl, document: editorDocument });
  await act(async () => root.render(null));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(io.close).not.toHaveBeenCalled();
  expect(io.apply).toHaveBeenCalledOnce();
});
