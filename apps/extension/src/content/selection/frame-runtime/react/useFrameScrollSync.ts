import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { createDebouncedScrollHandler } from '../roots/scroll/debounce';
import { createFrameScrollHandler } from '../roots/scroll/frame-updates';
import { observeIframeInsertions } from '../roots/scroll/iframe-observer';
import { registerIframeScrollListeners } from '../roots/scroll/iframe-registration';

type UseFrameScrollSyncArgs = {
  framesRef: MutableRefObject<FrameData[]>;
  frameStatesRef: MutableRefObject<Map<string, FrameState>>;
  linkedElementsRef: MutableRefObject<Map<string, HTMLElement>>;
  setFrames: Dispatch<SetStateAction<FrameData[]>>;
};

export function useFrameScrollSync({
  framesRef,
  frameStatesRef,
  linkedElementsRef,
  setFrames,
}: UseFrameScrollSyncArgs): void {
  useEffect(() => {
    const handleScroll = createFrameScrollHandler({
      framesRef,
      frameStatesRef,
      linkedElementsRef,
      setFrames,
    });
    const { debouncedHandleScroll, clearDebounce } = createDebouncedScrollHandler(handleScroll);
    const { iframeCleanups, addIframeListeners } =
      registerIframeScrollListeners(debouncedHandleScroll);
    const iframeObserver = observeIframeInsertions(addIframeListeners);

    window.addEventListener('scroll', debouncedHandleScroll, { passive: true });
    document.addEventListener('scroll', debouncedHandleScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', debouncedHandleScroll);

    return () => {
      window.removeEventListener('scroll', debouncedHandleScroll);
      document.removeEventListener('scroll', debouncedHandleScroll, { capture: true });
      window.removeEventListener('resize', debouncedHandleScroll);
      iframeCleanups.forEach((cleanup) => cleanup());
      iframeObserver.disconnect();
      clearDebounce();
    };
  }, [frameStatesRef, framesRef, linkedElementsRef, setFrames]);
}
