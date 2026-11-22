import type { ReviewBeforeAction } from './note-transitions';
import { useEffect, useRef } from 'react';
import type { ReviewAnnotation } from '../../features/video/review/types';
import { reviewCommandSourceTime, type ReviewCommandPort } from './command-context';

import {
  reviewKeyboardTarget,
  reviewOwnsKeys,
  reviewOwnsNavigation,
  reviewOwnsPlaybackKeys,
} from './keyboard-context';

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
  step,
  seek,
  play,
  cancelDrawing,
  navigation,
  undo,
  redo,
  remove,
  add,
  tool,
}: {
  step(direction: -1 | 1, large: boolean): void;
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
  const playbackSpace = useRef(false);
  useEffect(() => {
    // Capture before focused buttons/selects consume Space or schedule their native click.
    const onPlaybackKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const target = reviewKeyboardTarget(event);
      if (!target || reviewOwnsPlaybackKeys(target)) return;
      event.preventDefault();
      event.stopPropagation();
      playbackSpace.current = true;
      if (!event.repeat) play();
    };
    const onPlaybackKeyUp = (event: KeyboardEvent) => {
      if (!playbackSpace.current || (event.code !== 'Space' && event.key !== ' ')) return;
      playbackSpace.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const clearPlaybackKey = () => {
      playbackSpace.current = false;
    };
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
        step(direction, event.shiftKey);
      }
    };
    window.addEventListener('keydown', onPlaybackKeyDown, true);
    window.addEventListener('keyup', onPlaybackKeyUp, true);
    window.addEventListener('blur', clearPlaybackKey);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onPlaybackKeyDown, true);
      window.removeEventListener('keyup', onPlaybackKeyUp, true);
      window.removeEventListener('blur', clearPlaybackKey);
      window.removeEventListener('keydown', onKeyDown);
    };
  });
}

/** Gates every shortcut behind comment editing and exporter phases. */
export function useReviewEditorShortcuts(args: {
  commands: ReviewCommandPort;
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
    step: (direction, large) => {
      if (args.busy || exportBlocked) return;
      const context = args.commands.capture();
      if (!context) return;
      args.commands.admit(context, (accepted) => {
        const time = reviewCommandSourceTime(accepted);
        if (time === null) return;
        const next = args.boundaries
          ? direction > 0
            ? args.boundaries.find((value) => value > time)
            : [...args.boundaries].reverse().find((value) => value < time)
          : time + direction * (large ? 1 : 0.1);
        args.seek(next ?? time);
      });
    },
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
      if (!editingBlocked && !args.busy && !exportBlocked) args.addComment();
    },
    tool: (key) => {
      if (!editingBlocked && !args.busy && !exportBlocked) {
        if (key === 'v') admit(args.pointTool);
        else if (args.exporterAvailable) args.toggleCut();
      }
    },
  });
}
