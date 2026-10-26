import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { ContentToolbarPosition } from '../../../../contracts/settings';

type ToolbarSize = { width: number; height: number };
type ModeLayout = ToolbarSize & { mode: string; orientation: string };

function measureToolbar(toolbar: HTMLElement): ToolbarSize {
  return { width: toolbar.offsetWidth, height: toolbar.offsetHeight };
}

/** Animates mode geometry without scaling the toolbar text or its controls. */
export function useToolbarModeTransition(params: {
  toolbarRef: RefObject<HTMLDivElement | null>;
  commitLayout: () => ContentToolbarPosition;
  mode: string;
  orientation: string;
  ready: boolean;
  uiScale: number;
  recording: boolean;
}) {
  const previous = useRef<ModeLayout | null>(null);
  const animation = useRef<Animation | null>(null);

  useLayoutEffect(
    () => () => {
      animation.current?.cancel();
      params.toolbarRef.current?.removeAttribute('data-mode-transition');
    },
    [params.toolbarRef]
  );
  useLayoutEffect(() => {
    const toolbar = params.toolbarRef.current;
    if (!toolbar || !params.ready) return;
    const last = previous.current;
    const sameMode = last?.mode === params.mode && last.orientation === params.orientation;
    if (sameMode && animation.current) return;
    const origin = toolbar.getBoundingClientRect();
    const from = animation.current ? measureToolbar(toolbar) : last;
    animation.current?.cancel();
    animation.current = null;
    toolbar.removeAttribute('data-mode-transition');
    const position = !sameMode && !params.recording ? params.commitLayout() : null;
    const target = measureToolbar(toolbar);
    previous.current = { ...target, mode: params.mode, orientation: params.orientation };
    if (
      !from ||
      sameMode ||
      last?.orientation !== params.orientation ||
      params.recording ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      typeof toolbar.animate !== 'function' ||
      (from.width === target.width && from.height === target.height)
    )
      return;
    const x = position ? origin.x / params.uiScale - position.x : 0;
    const y = position ? origin.y / params.uiScale - position.y : 0;
    toolbar.dataset['modeTransition'] = 'true';
    const transition = toolbar.animate(
      [
        {
          inlineSize: `${from.width}px`,
          blockSize: `${from.height}px`,
          translate: `${x}px ${y}px`,
        },
        { inlineSize: `${target.width}px`, blockSize: `${target.height}px`, translate: '0px 0px' },
      ],
      {
        id: 'sniptale-toolbar-mode-transition',
        duration: 140,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }
    );
    animation.current = transition;
    void transition.finished.then(
      () => {
        if (animation.current === transition) {
          animation.current = null;
          toolbar.removeAttribute('data-mode-transition');
          previous.current = {
            ...measureToolbar(toolbar),
            mode: params.mode,
            orientation: params.orientation,
          };
        }
      },
      () => undefined
    );
  });
}
