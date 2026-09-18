import { act } from 'react';
import { createRoot } from 'react-dom/client';
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

interface EditorFixtureIntegration {
  load: ReturnType<typeof vi.fn>;
  index: ReturnType<typeof vi.fn>;
  draft: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  history: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  advanced: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
  export: ReturnType<typeof vi.fn>;
}

function stubReviewDom() {
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
  const show = vi
    .spyOn(HTMLDialogElement.prototype, 'showModal')
    .mockImplementation(function (this: HTMLDialogElement) {
      this.open = true;
    });
  const close = vi
    .spyOn(HTMLDialogElement.prototype, 'close')
    .mockImplementation(function (this: HTMLDialogElement) {
      this.open = false;
    });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
    function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('pause'));
    }
  );
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
    async function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play'));
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640);
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

function stubReviewSession(integration: EditorFixtureIntegration) {
  let snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'file',
      formatVersion: 1,
      source: { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 0,
      advanced: createQuickEditAdvancedState(),
      history: [],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  integration.load.mockImplementation(async () => ({
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
  }));
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
          ...snapshot.workspace,
          cursor: snapshot.workspace.cursor + (args.direction === 'undo' ? -1 : 1),
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

export function createEditorFixture(integration: EditorFixtureIntegration) {
  integration.index.mockRejectedValue(new Error('No safe index'));
  const { show, close, createUrl, revokeUrl, clipboard } = stubReviewDom();
  const session = stubReviewSession(integration);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const back = vi.fn();
  const button = (key: string) => {
    const node = host.querySelector<HTMLButtonElement>(`[aria-label="gallery.videoReview.${key}"]`);
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
