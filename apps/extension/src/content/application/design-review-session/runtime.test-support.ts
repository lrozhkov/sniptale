import { vi } from 'vitest';
import { createReviewSessionRuntime } from './runtime';
import { emptyReviewSessionDocument } from './controller';
import type { ReviewSessionPreview, ReviewSessionDocument } from './controller';
import type {
  DesignReviewSessionReply,
  DesignReviewSessionRequest,
} from '../../../contracts/design-review-session';
import type {
  BrowserDomAnnotationRecord,
  BrowserAnnotationSessionSnapshot,
} from '../../parser/page-preparation/annotations';

export const pageA = 'https://example.test/a';
export const pageB = 'https://example.test/b';
export const lease = '12345678-1234-4234-8234-123456789abc';
export function record(pageUrl = pageA, comment = 'Accepted feedback'): BrowserDomAnnotationRecord {
  return {
    annotationId: 1,
    creationOrder: 1,
    comment,
    propertyChanges: [],
    evidence: {
      fileLabel: 'browser:button',
      frame: { kind: 'top-document' },
      locator: '#target',
      nodePosition: { x: 10, y: 20 },
      pageUrl,
      targetPath: 'button#target',
      targetSelector: 'button#target',
      targetText: 'Continue',
      viewport: { width: 1280, height: 560 },
    },
  };
}
export function annotationSnapshot(
  records: BrowserDomAnnotationRecord[] = []
): BrowserAnnotationSessionSnapshot {
  return {
    schemaVersion: 1,
    domRecords: records,
    frameOrders: [],
    nextAnnotationId: 2,
    nextCreationOrder: 2,
    nextMarkerNumber: 2,
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function setup() {
  let pageUrl = pageA;
  let annotations = annotationSnapshot();
  const target = document.createElement('button');
  const initial: ReviewSessionDocument = {
    ...emptyReviewSessionDocument(),
    enabled: true,
    tool: 'navigate',
    panelOpen: true,
    position: { x: 60, y: 100 },
    entries: [{ id: lease, record: record(), unavailable: false }],
  };
  let saved = JSON.stringify(initial);
  let revision = 4;
  const ready = (message: DesignReviewSessionRequest): DesignReviewSessionReply => ({
    requestId: message.requestId,
    status: 'ready',
    lease,
    revision,
    available: false,
    payload: saved,
  });
  const request = vi.fn(
    async (message: DesignReviewSessionRequest): Promise<DesignReviewSessionReply> => {
      if (message.kind === 'save' || message.kind === 'clear') {
        saved = message.payload;
        revision += 1;
      }
      return ready(message);
    }
  );
  const ports = {
    request,
    pageUrl: () => pageUrl,
    resolve: vi.fn((value: BrowserDomAnnotationRecord) =>
      value.evidence.pageUrl === pageUrl ? target : null
    ),
    annotations: {
      captureSnapshot: () => structuredClone(annotations),
      applySnapshot: vi.fn((value: BrowserAnnotationSessionSnapshot) => {
        annotations = structuredClone(value);
      }),
      resetForDocument: vi.fn(() => {
        annotations = annotationSnapshot();
      }),
      rebindTargets: vi.fn(),
      getLiveTarget: vi.fn(() => target),
      subscribe: vi.fn(() => () => {}),
    },
    openTarget: vi.fn(() => true),
    navigate: vi.fn(),
    removeTarget: vi.fn(() => {
      annotations = annotationSnapshot();
    }),
    clearTargets: vi.fn(async () => {
      annotations = annotationSnapshot();
    }),
    capture: vi.fn(async (): Promise<ReviewSessionPreview | null> => null),
    restoreMode: vi.fn(),
  };
  const runtime = createReviewSessionRuntime(ports);
  return {
    runtime,
    ports,
    initial,
    ready,
    saved: () => saved,
    setAnnotations: (records: BrowserDomAnnotationRecord[]) => {
      annotations = annotationSnapshot(records);
    },
    navigatePage: (url: string) => {
      pageUrl = url;
      annotations = annotationSnapshot();
      runtime.navigatePage();
    },
  };
}
export function settled(
  runtime: ReturnType<typeof createReviewSessionRuntime>,
  failed = false
): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      const state = runtime.getSnapshot();
      if (!state.pending && state.error === failed) {
        unsubscribe();
        resolve();
      }
    };
    const unsubscribe = runtime.subscribe(check);
    check();
  });
}
