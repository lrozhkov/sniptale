// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createBrowserAnnotationSession,
  createBrowserAnnotationTargetEvidence,
} from '../parser/page-preparation/annotations';
import { initializeContentUiRoots } from '../platform/dom-host';
import { createContentRuntimeServices } from './runtime-services/services';
import { createDesignReviewReportExporter } from './design-review-report';
import type { printReviewReport } from '../parser/page-preparation/annotations/format/print';
import { cropImage } from '@sniptale/platform/browser/media/image-crop';

vi.mock('@sniptale/platform/browser/media/image-crop', () => ({
  cropImage: vi.fn(async () => 'data:image/png;base64,aGVsbG8='),
}));
let annotations: ReturnType<typeof createBrowserAnnotationSession>;
let services: ReturnType<typeof createContentRuntimeServices>;
let target: HTMLElement;
let host: HTMLElement;
const source = { kind: 'trusted-content-event' } as const;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  initializeContentUiRoots(host.attachShadow({ mode: 'open' }));
  target = document.createElement('p');
  target.textContent = 'Review target';
  document.body.append(target);
  target.scrollIntoView = () => {
    document.documentElement.scrollTop = 50;
  };
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 20, y: 30, width: 100, height: 40 })
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  annotations = createBrowserAnnotationSession();
  annotations.setComment({
    target,
    evidence: createBrowserAnnotationTargetEvidence(target),
    comment: 'Keep this feedback',
  });
  services = createContentRuntimeServices();
  vi.spyOn(services.contentActionIntent, 'attachContentActionIntent').mockImplementation(
    async (message) => message
  );
});
afterEach(() => {
  document.documentElement.scrollLeft = 0;
  document.documentElement.scrollTop = 0;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('captures a real target through the existing intent boundary and restores scroll and chrome', async () => {
  const send = vi
    .spyOn(services.messaging, 'sendRuntimeMessage')
    .mockResolvedValue({ success: true, dataUrl: 'data:image/png;base64,aGVsbG8=' });
  const print = vi.fn<typeof printReviewReport>(async () => undefined);
  const exportReport = createDesignReviewReportExporter({
    annotations,
    services: () => services,
    print,
  });
  await exportReport('Review', source);
  expect(services.contentActionIntent.attachContentActionIntent).toHaveBeenCalledWith(
    expect.objectContaining({ type: expect.any(String) }),
    source
  );
  expect(send).toHaveBeenCalledOnce();
  expect(cropImage).toHaveBeenCalledWith(expect.any(String), {
    x: 4,
    y: 14,
    width: 132,
    height: 72,
  });
  expect(print).toHaveBeenCalledWith(
    'Review',
    expect.objectContaining({
      domRecords: [expect.objectContaining({ comment: 'Keep this feedback' })],
    }),
    expect.objectContaining({ previews: expect.any(Map) })
  );
  expect(print.mock.calls[0]?.[2]?.previews?.size).toBe(1);
  expect(document.documentElement.scrollTop).toBe(0);
  expect(host.classList.contains('sniptale-capture-ui-hidden')).toBe(false);
});

it('refuses overlapping export and discards a capture that settles after the annotation session changes', async () => {
  let resolveFrame: ((value: { success: boolean; dataUrl: string }) => void) | undefined;
  vi.spyOn(services.messaging, 'sendRuntimeMessage').mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveFrame = resolve;
      })
  );
  const print = vi.fn<typeof printReviewReport>(async () => undefined);
  const exportReport = createDesignReviewReportExporter({
    annotations,
    services: () => services,
    print,
  });
  const pending = exportReport('Review', source);
  await vi.waitFor(() => expect(resolveFrame).toBeDefined());
  await expect(exportReport('Duplicate', source)).rejects.toThrow('already being prepared');
  annotations.resetForDocument();
  resolveFrame?.({ success: true, dataUrl: 'data:image/png;base64,aGVsbG8=' });
  await pending;
  expect(print.mock.calls[0]?.[2]?.previews?.size).toBe(0);
  expect(print.mock.calls[0]?.[1]?.domRecords[0]?.comment).toBe('Keep this feedback');
  expect(host.classList.contains('sniptale-capture-ui-hidden')).toBe(false);
});

it('keeps accepted feedback on capture refusal and permits a fresh export afterwards', async () => {
  vi.spyOn(services.messaging, 'sendRuntimeMessage').mockRejectedValue(
    new Error('Capture refused')
  );
  const print = vi.fn<typeof printReviewReport>(async () => undefined);
  const exportReport = createDesignReviewReportExporter({
    annotations,
    services: () => services,
    print,
  });
  await exportReport('Review', source);
  await exportReport('Retry', source);
  expect(print).toHaveBeenCalledTimes(2);
  expect(print.mock.calls[0]?.[2]?.previews?.size).toBe(0);
  expect(annotations.captureSnapshot().domRecords[0]?.comment).toBe('Keep this feedback');
  expect(document.documentElement.scrollTop).toBe(0);
  expect(host.classList.contains('sniptale-capture-ui-hidden')).toBe(false);
});

it.each([
  ['shadow', true],
  ['shadow', false],
  ['slot', true],
  ['slot', false],
] as const)(
  'restores composed scroll owners for a %s target after capture success=%s',
  async (placement, success) => {
    const outer = document.createElement('div');
    const pageHost = document.createElement('section');
    const shadow = pageHost.attachShadow({ mode: 'open' });
    const inner = document.createElement('div');
    outer.append(pageHost);
    shadow.append(inner);
    document.body.append(outer);
    if (placement === 'slot') {
      inner.append(document.createElement('slot'));
      pageHost.append(target);
    } else {
      inner.append(target);
    }
    outer.scrollLeft = 11;
    outer.scrollTop = 22;
    inner.scrollLeft = 33;
    inner.scrollTop = 44;
    document.documentElement.scrollLeft = 55;
    document.documentElement.scrollTop = 66;
    target.scrollIntoView = () => {
      outer.scrollLeft = 101;
      outer.scrollTop = 102;
      inner.scrollLeft = 103;
      inner.scrollTop = 104;
      document.documentElement.scrollLeft = 105;
      document.documentElement.scrollTop = 106;
    };
    vi.spyOn(services.messaging, 'sendRuntimeMessage').mockImplementation(async () => {
      if (!success) throw new Error('Capture refused');
      return { success: true, dataUrl: 'data:image/png;base64,aGVsbG8=' };
    });
    const print = vi.fn<typeof printReviewReport>(async () => undefined);
    await createDesignReviewReportExporter({ annotations, services: () => services, print })(
      'Review',
      source
    );
    expect([outer.scrollLeft, outer.scrollTop]).toEqual([11, 22]);
    expect([inner.scrollLeft, inner.scrollTop]).toEqual([33, 44]);
    expect([document.documentElement.scrollLeft, document.documentElement.scrollTop]).toEqual([
      55, 66,
    ]);
    expect(print.mock.calls[0]?.[2]?.previews?.size).toBe(success ? 1 : 0);
    expect(annotations.captureSnapshot().domRecords[0]?.comment).toBe('Keep this feedback');
  }
);
