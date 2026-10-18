import { moveReviewWorkspaceCursor } from '../../composition/persistence/review-workspaces/history-cursor';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { replayReviewHistory, reviewDocumentBaseline } from '../../features/video/review/document';
import { vi } from 'vitest';
import {
  parseReviewAnnotation,
  parseReviewOperation,
} from '../../features/video/review/validation';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { loadQuickEditAdvancedState } from '../../features/video/review/advanced/validation';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type {
  saveVideoWorkspaceAdvanced,
  saveVideoWorkspaceDraft,
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
} from '../../composition/persistence/review-workspaces/store';
import type { ReviewOperation } from '../../features/video/review/types';

/** Mirrors the committed-projection adapter using the fixture's accepted history. */
export function committedEditorFixtureProjection(snapshot: VideoWorkspaceSnapshot) {
  return {
    snapshot,
    document: replayReviewHistory(
      snapshot.workspace.history,
      snapshot.workspace.cursor,
      snapshot.workspace.source,
      reviewDocumentBaseline(snapshot.workspace)
    ),
  };
}

interface EditorFixtureIntegration {
  load: ReturnType<typeof vi.fn>;
  index: ReturnType<typeof vi.fn>;
  draft: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  history: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  advanced: ReturnType<typeof vi.fn>;
  snapshot?: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
  export: ReturnType<typeof vi.fn>;
}

function stubReviewDom(inspectorWidth: number) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  for (const [target, key] of [
    [HTMLDialogElement.prototype, 'showModal'],
    [HTMLDialogElement.prototype, 'close'],
    [URL, 'createObjectURL'],
    [URL, 'revokeObjectURL'],
  ] as const) {
    if (!(key in target))
      Object.defineProperty(target, key, {
        configurable: true,
        writable: true,
        value: () => undefined,
      });
  }
  const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement
  ) {
    this.open = true;
  });
  const close = vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
    this: HTMLDialogElement
  ) {
    this.open = false;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (
    this: HTMLMediaElement
  ) {
    this.dispatchEvent(new Event('play'));
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    return this.closest('aside') ? inspectorWidth : 640;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:review');
  const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const clipboard = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboard },
  });
  return { show, close, createUrl, revokeUrl, clipboard };
}

function stubReviewSession(integration: EditorFixtureIntegration, history: ReviewOperation[]) {
  let snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'file',
      formatVersion: 1,
      source: { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: history.length,
      advanced: createQuickEditAdvancedState(),
      history: [...history],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  integration.load.mockImplementation(async () => {
    if (process.env['DEBUG_FIXTURE'])
      console.log('fixture history', JSON.stringify(snapshot.workspace.history));
    return {
      source: snapshot.workspace.source,
      snapshot: structuredClone(snapshot),
      file: new File(['video'], 'video.webm'),
      filename: 'video.webm',
      telemetry: {
        captureMode: 'tab',
        viewport: { width: 320, height: 180 },
        actionEvents: [],
        cursorTrack: null,
        signals: [
          { id: 'idle', kind: 'cursor-idle', startTime: 2, endTime: 3, point: null, data: {} },
          {
            id: 'warning',
            kind: 'static-frame',
            startTime: 0,
            endTime: 0,
            point: null,
            data: { code: 'unavailable' },
          },
        ],
      },
    };
  });
  integration.draft.mockImplementation(
    async (args: Parameters<typeof saveVideoWorkspaceDraft>[0]) => {
      snapshot = {
        ...snapshot,
        draft: args.annotation
          ? {
              aggregateId: 'recording:r',
              annotation: parseReviewAnnotation(args.annotation, 4, true)!,
              before: args.before ? parseReviewAnnotation(args.before, 4)! : null,
              revision: (snapshot.draft?.revision ?? 0) + 1,
              updatedAt: 2,
            }
          : null,
      };
      return structuredClone(snapshot);
    }
  );
  integration.snapshot?.mockImplementation(
    async (args: { workspace: unknown; draft: VideoWorkspaceSnapshot['draft'] }) => {
      const workspace = parseVideoWorkspace(args.workspace);
      if (!workspace) throw new Error('Invalid fixture workspace.');
      snapshot = {
        workspace: { ...workspace, revision: snapshot.workspace.revision + 1 },
        draft: args.draft,
      };
      return structuredClone(snapshot);
    }
  );
  integration.commit.mockImplementation(
    async (args: Parameters<typeof commitVideoWorkspace>[0]) => {
      snapshot = {
        ...snapshot,
        workspace: {
          ...snapshot.workspace,
          revision: snapshot.workspace.revision + 1,
          history: [
            ...snapshot.workspace.history.slice(0, snapshot.workspace.cursor),
            parseReviewOperation(args.operation, 4)!,
          ],
          cursor: snapshot.workspace.cursor + 1,
        },
        draft: args.consumeDraftRevision ? null : snapshot.draft,
      };
      return structuredClone(snapshot);
    }
  );
  integration.history.mockImplementation(
    async (args: Parameters<typeof moveVideoWorkspaceHistory>[0]) => {
      snapshot = {
        ...snapshot,
        workspace: {
          ...moveReviewWorkspaceCursor(
            snapshot.workspace,
            args.direction === 'start'
              ? 0
              : snapshot.workspace.cursor + (args.direction === 'undo' ? -1 : 1)
          ),
          revision: snapshot.workspace.revision + 1,
        },
      };
      return structuredClone(snapshot);
    }
  );
  integration.read.mockImplementation(async () => structuredClone(snapshot));
  integration.advanced.mockImplementation(
    async (args: Parameters<typeof saveVideoWorkspaceAdvanced>[0]) => {
      const advanced = loadQuickEditAdvancedState(args.advanced);
      if (!advanced) throw new Error('Advanced state is invalid.');
      snapshot = {
        ...snapshot,
        workspace: {
          ...snapshot.workspace,
          revision: snapshot.workspace.revision + 1,
          advanced,
        },
      };
      return structuredClone(snapshot);
    }
  );
  return {
    get snapshot() {
      return structuredClone(snapshot);
    },
  };
}

export function createEditorFixture(
  integration: EditorFixtureIntegration,
  options?: {
    history?: readonly ReviewOperation[];
    /** Zero retains JSDOM's absent inspector layout for history-only scenarios. */
    inspectorWidth?: number;
  }
) {
  integration.index.mockRejectedValue(new Error('No safe index'));
  const { show, close, createUrl, revokeUrl, clipboard } = stubReviewDom(
    options?.inspectorWidth ?? 640
  );
  const session = stubReviewSession(integration, [...(options?.history ?? [])]);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const back = vi.fn();
  const button = (key: string) => {
    const node = host.querySelector<HTMLButtonElement>(
      `[aria-label="${key.includes('.') ? key : `gallery.videoReview.${key}`}"]`
    );
    if (!node) throw new Error(`Missing ${key}`);
    return node;
  };
  const click = async (key: string) => act(async () => button(key).click());
  const fill = async (value: string) =>
    act(async () => {
      const field = host.querySelector('textarea')!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        field,
        value
      );
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  return {
    host,
    root,
    back,
    button,
    click,
    key(event: KeyboardEvent) {
      const surface = host.querySelector<HTMLElement>(
        '[data-ui="gallery.videoReview.previewFrame"]'
      )!;
      surface.tabIndex = -1;
      surface.focus();
      window.dispatchEvent(event);
    },
    async selectRulerRange(start: number, end: number) {
      const ruler = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.ruler"]')!;
      const duration = Number(ruler.getAttribute('aria-valuemax'));
      Object.assign(ruler, {
        getBoundingClientRect: () => new DOMRect(0, 0, 400, 28),
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
        hasPointerCapture: () => true,
      });
      for (const [type, time] of [
        ['pointerdown', start],
        ['pointermove', end],
        ['pointerup', end],
      ] as const) {
        const event = new MouseEvent(type, {
          bubbles: true,
          button: 0,
          clientX: (time / duration) * 400,
          clientY: 15,
        });
        Object.defineProperty(event, 'pointerId', { value: 1 });
        await act(async () => {
          ruler.dispatchEvent(event);
        });
      }
    },
    async addFocus(start?: number, end?: number) {
      const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
      const at = start ?? Number(plane.getAttribute('aria-valuenow'));
      const until = end ?? Math.min(Number(plane.getAttribute('aria-valuemax')), at + 2);
      if (button('focusRangeTool').getAttribute('aria-pressed') !== 'true')
        await click('focusRangeTool');
      const gutter = Number.parseFloat(plane.style.getPropertyValue('--review-track-gutter'));
      const duration = Number(plane.getAttribute('aria-valuemax'));
      Object.assign(plane, {
        getBoundingClientRect: () => new DOMRect(-gutter, 0, gutter + 400, 80),
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
        hasPointerCapture: () => true,
      });
      for (const [type, time] of [
        ['pointerdown', at],
        ['pointermove', until],
        ['pointerup', until],
      ] as const) {
        const event = new MouseEvent(type, {
          bubbles: true,
          button: 0,
          clientX: (time / duration) * 400,
        });
        Object.defineProperty(event, 'pointerId', { value: 1 });
        const target =
          type === 'pointerdown'
            ? host.querySelector('[data-ui="gallery.videoReview.zoomLane"]')!
            : plane;
        await act(async () => {
          target.dispatchEvent(event);
        });
      }
    },
    fill,
    show,
    close,
    createUrl,
    revokeUrl,
    clipboard,
    get snapshot() {
      return session.snapshot;
    },
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}
