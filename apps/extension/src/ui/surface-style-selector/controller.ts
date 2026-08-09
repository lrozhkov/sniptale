import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matchSurfaceStylePreset } from '../../features/highlighter/surface-style/operations';
import { canonicalizeSurfaceCss } from '../../features/highlighter/surface-style/surface-css';
import { useSurfaceStyleDraft } from './draft';
import { useSurfaceStyleLayerLifecycle } from './layer-lifecycle';
import type { SurfaceStyleSelectorProps } from './types';

export function useSurfaceStyleSelectorController(props: SurfaceStyleSelectorProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { draft, setDraft } = useSurfaceStyleDraft(props.value, open, props.disabled ?? false);
  const canonicalCss = canonicalizeSurfaceCss(draft.surfaceCss);
  const active = useMemo(
    () => matchSurfaceStylePreset(draft, props.presets),
    [draft, props.presets]
  );
  const onOpenChange = props.onOpenChange;
  const notifyOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
      if (!next) queueMicrotask(() => triggerRef.current?.focus());
    },
    [onOpenChange]
  );
  useEffect(() => {
    if (props.disabled && open) notifyOpen(false);
  }, [notifyOpen, open, props.disabled]);
  useSurfaceStyleLayerLifecycle({
    onDismiss: () => notifyOpen(false),
    onLifecycleClosed: () => onOpenChange?.(false),
    open,
    rootRef,
  });
  return {
    actions: { notifyOpen, setDraft, setName },
    refs: { root: rootRef, trigger: triggerRef },
    state: { active, canonicalCss, draft, name, open },
  };
}
