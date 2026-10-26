import { useEffect, useRef, useState } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../platform/i18n';
import {
  installCornerGroupDrag,
  type CornerGroupDragState,
} from '../../platform/corner-group/drag';
import { pageCornerOffsets } from '../../platform/corner-group/geometry';
import { usePageLaunchPreferences } from '../quick-actions/preferences';

export function useCollapsedPanelDrag(visible: boolean, uiScale: number) {
  const dockRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const accepted = usePageLaunchPreferences();
  const current = useRef(accepted);
  current.current = accepted;
  const controller = useRef<ReturnType<typeof installCornerGroupDrag> | null>(null);
  const [state, setState] = useState<CornerGroupDragState>({
    draft: null,
    pending: false,
    dragging: false,
  });
  useEffect(() => {
    if (!visible || !dockRef.current || !handleRef.current) return;
    const drag = installCornerGroupDrag({
      group: dockRef.current,
      handle: handleRef.current,
      getCorner: () => current.current.preferences.corner,
      onCommit: (corner, event) => current.current.saveCorner(corner, event),
      onState: setState,
      onError: () => showToast(translate('content.pageLauncher.failed'), 'error'),
    });
    controller.current = drag;
    return () => {
      drag.dispose();
      controller.current = null;
    };
  }, [visible]);
  useEffect(() => controller.current?.refresh(), [accepted.preferences.corner]);
  const corner = accepted.preferences.corner;
  return {
    dockRef,
    corner,
    activeCorner: state.draft?.corner ?? corner,
    dragging: state.dragging,
    style: state.draft
      ? { left: state.draft.x, top: state.draft.y, transformOrigin: 'top left' }
      : pageCornerOffsets(
          corner,
          uiScale,
          window.innerWidth - (document.documentElement.clientWidth || window.innerWidth)
        ),
    handleProps: { ref: handleRef },
    preferences: accepted.preferences,
  };
}
