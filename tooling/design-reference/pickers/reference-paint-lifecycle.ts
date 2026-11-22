import { useEffect, useMemo } from 'react';
import { isEyedropperSessionActive } from '@sniptale/ui/color-selector/popover-state';
import { isComposedEventWithinAnyElement } from '@sniptale/ui/dom-events';
import { getOwnedFloatingInteractionLayers } from '@sniptale/ui/floating-interactions/ownership';
import { usePaintSelectorLifecycle as useCanonicalLifecycle } from '../../../apps/extension/src/ui/paint-selector/lifecycle';

type Options = Parameters<typeof useCanonicalLifecycle>[0];

function hasOutsideInspectorFocus(root: HTMLDivElement | null) {
  if (!root?.classList.contains('gradient-field')) return false;
  const scope = root.getRootNode();
  const document = root.ownerDocument;
  const active =
    (scope instanceof ShadowRoot ? scope.activeElement : null) ?? document.activeElement;
  return active !== null && active !== document.body && !root.contains(active);
}

export function usePaintSelectorLifecycle(options: Options) {
  const { cancel, eyedropperActiveRef, layerRef, open, rootRef, triggerRef } = options;
  const focusRefs = useMemo(() => {
    // The canonical close callback reads these refs on the next frame.
    const canRestore = () => open || !hasOutsideInspectorFocus(rootRef.current);
    return {
      rootRef: {
        get current() {
          return canRestore() ? rootRef.current : null;
        },
      },
      triggerRef: {
        get current() {
          return canRestore() ? triggerRef.current : null;
        },
      },
    };
  }, [open, rootRef, triggerRef]);

  useCanonicalLifecycle({ ...options, ...focusRefs });
  useEffect(() => {
    const root = rootRef.current;
    if (!open || !root?.classList.contains('gradient-field')) return;
    const scope = root.getRootNode();
    if (!(scope instanceof Document || scope instanceof ShadowRoot)) return;

    // Text accessories can focus another field without dispatching a mouse-down event.
    const dismissOnFocus = (event: Event) => {
      const layer = layerRef.current;
      if (!layer || eyedropperActiveRef.current || isEyedropperSessionActive()) return;
      const owners = [root, layer, ...getOwnedFloatingInteractionLayers(layer, scope)];
      if (!isComposedEventWithinAnyElement(event, owners)) cancel();
    };
    const document = root.ownerDocument;
    scope.addEventListener('focusin', dismissOnFocus, true);
    if (scope !== document) document.addEventListener('focusin', dismissOnFocus, true);
    return () => {
      scope.removeEventListener('focusin', dismissOnFocus, true);
      if (scope !== document) document.removeEventListener('focusin', dismissOnFocus, true);
    };
  }, [cancel, eyedropperActiveRef, layerRef, open, rootRef]);
}
