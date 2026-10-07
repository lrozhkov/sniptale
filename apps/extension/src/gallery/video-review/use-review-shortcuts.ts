import type { ReviewBeforeAction } from './note-transitions';
import { useEffect } from 'react';
import type { ReviewAnnotation } from '../../features/video/review/types';

import { reviewKeyboardTarget, reviewOwnsKeys, reviewOwnsNavigation } from './keyboard-context';

function handleBoundaryShortcut(
  event: KeyboardEvent,
  navigation: { start: number; end: number },
  seek: (value: number, snap?: boolean) => void
): boolean {
  const home = event.code === 'Home' || event.key === 'Home';
  const end = event.code === 'End' || event.key === 'End';
  if (!home && !end) return false;
  if (event.shiftKey || (event.target instanceof HTMLElement && reviewOwnsNavigation(event.target)))
    return false;
  event.preventDefault();
  seek(home ? navigation.start : navigation.end, false);
  return true;
}

function useReviewKeys({
  time,
  seek,
  play,
  cancelDrawing,
  boundaries,
  navigation,
  undo,
  redo,
  remove,
  add,
  tool,
}: {
  time: number;
  boundaries?: readonly number[];
  navigation: { start: number; end: number };
  seek(value: number, snap?: boolean): void;
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
      if (event.defaultPrevented || event.isComposing) return;
      const target = reviewKeyboardTarget(event);
      if (!target || reviewOwnsKeys(target)) return;
      const key = event.code.startsWith('Key')
        ? event.code.slice(3).toLowerCase()
        : event.key.toLowerCase();
      if (event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        if (!event.repeat) cancelDrawing();
        return;
      }
      if (
        !event.altKey &&
        !(event.ctrlKey && event.metaKey) &&
        (event.ctrlKey || event.metaKey) &&
        ['z', 'y'].includes(key)
      ) {
        event.preventDefault();
        if (event.repeat) return;
        if (key === 'y' || event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (handleBoundaryShortcut(event, navigation, seek)) return;
      if (event.key === ' ') {
        if (reviewOwnsNavigation(target)) return;
        event.preventDefault();
        if (!event.repeat) play();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        if (!event.repeat) remove();
        return;
      }
      if (!event.shiftKey && key === 'm') {
        event.preventDefault();
        if (!event.repeat) add();
        return;
      }
      if (!event.shiftKey && (key === 'c' || key === 'v')) {
        event.preventDefault();
        if (!event.repeat) tool(key === 'c' ? 'c' : 'v');
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (reviewOwnsNavigation(target)) return;
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
  navigation: { start: number; end: number };
  seek(value: number, snap?: boolean): void;
  play(): void;
  composerAnnotation: ReviewAnnotation | null;
  beforeAction?: ReviewBeforeAction | undefined;
  busy: boolean;
  exporterPhase: 'idle' | 'exporting' | 'publishing';
  exporterAvailable: boolean;
  boundaries: readonly number[] | undefined;
  run(action: () => Promise<unknown>): Promise<unknown>;
  undo(): Promise<unknown>;
  redo(): Promise<unknown>;
  cancelDrawing(): void;
  pointTool(): void;
  remove(): void;
  addComment(): void;
  toggleCut(): void;
}) {
  const editingBlocked = !!args.composerAnnotation;
  const exportBlocked = args.exporterPhase !== 'idle';
  const admit = args.beforeAction ?? ((action: () => void) => action());
  useReviewKeys({
    time: args.time,
    navigation: args.navigation,
    seek: (...values) => {
      if (!args.busy && !exportBlocked) admit(() => args.seek(...values));
    },
    play: () => {
      if (!args.busy && !exportBlocked) admit(args.play);
    },
    cancelDrawing: args.cancelDrawing,
    undo: () => {
      if (!editingBlocked && !args.busy && !exportBlocked) void args.run(args.undo);
    },
    redo: () => {
      if (!editingBlocked && !args.busy && !exportBlocked) void args.run(args.redo);
    },
    remove: () => {
      if (!editingBlocked && !args.busy && !exportBlocked) admit(args.remove);
    },
    add: () => {
      if (!editingBlocked && !args.busy && !exportBlocked) admit(args.addComment);
    },
    tool: (key) => {
      if (!editingBlocked && !args.busy && !exportBlocked) {
        admit(() => {
          if (key === 'v') args.pointTool();
          else if (args.exporterAvailable) args.toggleCut();
        });
      }
    },
    ...(args.boundaries ? { boundaries: args.boundaries } : {}),
  });
}
