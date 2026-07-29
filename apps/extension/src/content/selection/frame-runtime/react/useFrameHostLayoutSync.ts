import { useEffect, useRef, useSyncExternalStore } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../platform/i18n';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import type { FrameSetter, FrameStateSetter } from '../contracts';
import type { FrameHostLayoutService } from '../host-layout/service';
import { useFrameUIStore } from '../state/frame-ui.store';

export function useFrameHostLayoutSync(args: {
  frameStatesRef: React.MutableRefObject<Map<string, FrameState>>;
  framesRef: React.MutableRefObject<FrameData[]>;
  hostLayoutService: FrameHostLayoutService;
  setFrames: FrameSetter;
  setFrameStates: FrameStateSetter;
}) {
  const { frameStatesRef, framesRef, hostLayoutService, setFrames, setFrameStates } = args;
  const temporaryNoticeShownRef = useRef(new Set<string>());
  const snapshot = useSyncExternalStore(
    hostLayoutService.subscribe,
    hostLayoutService.getSnapshot,
    hostLayoutService.getSnapshot
  );

  useEffect(
    () =>
      hostLayoutService.start({
        frameStatesRef,
        framesRef,
        onAnchorUnavailable(frameId, presentation) {
          const selected = useFrameUIStore.getState().selectedFrameId === frameId;
          useFrameUIStore.getState().dismissFrame(frameId);
          const currentFrameStates = frameStatesRef.current;
          if (currentFrameStates.has(frameId) && currentFrameStates.get(frameId) !== 'idle') {
            const next = new Map(currentFrameStates);
            next.set(frameId, 'idle');
            frameStatesRef.current = next;
            setFrameStates(next);
          }
          if (
            presentation === 'suspended' &&
            selected &&
            !temporaryNoticeShownRef.current.has(frameId)
          ) {
            temporaryNoticeShownRef.current.add(frameId);
            showToast(translate('content.interactiveFrame.anchorTemporarilyHidden'), 'info');
          }
        },
        setFrames,
      }),
    [frameStatesRef, framesRef, hostLayoutService, setFrameStates, setFrames]
  );

  return snapshot;
}
