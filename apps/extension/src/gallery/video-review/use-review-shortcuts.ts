import { useEffect } from 'react';
import type { ReviewAnnotation } from '../../features/video/review/types';

function useReviewKeys({
  time,
  seek,
  play,
  cancelDrawing,
  boundaries,
  undo,
  redo,
  remove,
  add,
  tool,
}: {
  time: number;
  boundaries?: readonly number[];
  seek(value: number): void;
  play(): void;
  cancelDrawing(): void;
  undo(): void;
  redo(): void;
  remove(): void;
  add(): void;
  tool(key: 'c' | 'v'): void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelDrawing();
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest('input,textarea,select') || target.isContentEditable)
      )
        return;
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.key.toLowerCase() === 'y' || event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) play();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        remove();
        return;
      }
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        add();
        return;
      }
      if (event.key.toLowerCase() === 'c' || event.key.toLowerCase() === 'v') {
        event.preventDefault();
        tool(event.key.toLowerCase() === 'c' ? 'c' : 'v');
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        const next = boundaries
          ? direction > 0
            ? boundaries.find((value) => value > time)
            : [...boundaries].reverse().find((value) => value < time)
          : time + direction * (event.shiftKey ? 1 : 0.1);
        seek(next ?? time);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
}

/** Gates every shortcut behind comment editing and exporter phases. */
export function useReviewEditorShortcuts(args: {
  time: number;
  seek(value: number, snap?: boolean): void;
  play(): void;
  composerAnnotation: ReviewAnnotation | null;
  busy: boolean;
  exporterPhase: 'idle' | 'exporting' | 'publishing';
  exporterAvailable: boolean;
  boundaries: readonly number[] | undefined;
  run(action: () => Promise<unknown>): Promise<unknown>;
  session: ReturnType<
    typeof import('../../workflows/video-review/session').createVideoReviewSession
  >;
  cancelDrawing(): void;
  pointTool(): void;
  remove(): void;
  addComment(): void;
  toggleCut(): void;
}) {
  const editingBlocked = !!args.composerAnnotation;
  const exportBlocked = args.exporterPhase !== 'idle';
  useReviewKeys({
    time: args.time,
    seek: args.seek,
    play: args.play,
    cancelDrawing: args.cancelDrawing,
    undo: () => {
      if (!editingBlocked && !exportBlocked) void args.run(() => args.session.history('undo'));
    },
    redo: () => {
      if (!editingBlocked && !exportBlocked) void args.run(() => args.session.history('redo'));
    },
    remove: () => {
      if (!editingBlocked && !args.busy && !exportBlocked) args.remove();
    },
    add: args.addComment,
    tool: (key) => {
      if (!editingBlocked && !args.busy && !exportBlocked) {
        if (key === 'v') args.pointTool();
        else if (args.exporterAvailable) args.toggleCut();
      }
    },
    ...(args.boundaries ? { boundaries: args.boundaries } : {}),
  });
}
