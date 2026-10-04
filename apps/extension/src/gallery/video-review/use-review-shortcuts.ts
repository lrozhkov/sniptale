import type { ReviewBeforeAction } from './note-transitions';
import { useEffect } from 'react';
import type { ReviewAnnotation } from '../../features/video/review/types';

const localNavigation = [
  '[role="slider"]:not([data-ui="gallery.videoReview.timePlane"])',
  '[role="listbox"],[role="option"],[role="tab"],[role="menuitem"]',
  '[data-ui="gallery.videoReview.inspector"] :is(button,summary)',
].join(',');

function handleBoundaryShortcut(
  event: KeyboardEvent,
  navigation: { start: number; end: number },
  seek: (value: number, snap?: boolean) => void
): boolean {
  const home = event.code === 'Home' || event.key === 'Home';
  const end = event.code === 'End' || event.key === 'End';
  if (!home && !end) return false;
  if (event.shiftKey || (event.target instanceof Element && event.target.closest(localNavigation)))
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
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"],[role="alertdialog"]')
      )
        return;
      const key = event.code.startsWith('Key')
        ? event.code.slice(3).toLowerCase()
        : event.key.toLowerCase();
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
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(key)) {
        event.preventDefault();
        if (key === 'y' || event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (handleBoundaryShortcut(event, navigation, seek)) return;
      if (event.key === ' ') {
        if (
          target instanceof HTMLElement &&
          target.closest('[data-ui="gallery.videoReview.inspector"]') &&
          target.closest('button,summary')
        )
          return;
        event.preventDefault();
        if (!event.repeat) play();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        remove();
        return;
      }
      if (key === 'm') {
        event.preventDefault();
        add();
        return;
      }
      if (key === 'c' || key === 'v') {
        event.preventDefault();
        tool(key === 'c' ? 'c' : 'v');
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
    seek: (...values) => admit(() => args.seek(...values)),
    play: () => admit(args.play),
    cancelDrawing: args.cancelDrawing,
    undo: () => {
      if (!editingBlocked && !exportBlocked) void args.run(args.undo);
    },
    redo: () => {
      if (!editingBlocked && !exportBlocked) void args.run(args.redo);
    },
    remove: () => {
      if (!editingBlocked && !args.busy && !exportBlocked) admit(args.remove);
    },
    add: () => admit(args.addComment),
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
