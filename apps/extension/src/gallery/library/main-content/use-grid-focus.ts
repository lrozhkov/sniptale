import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GalleryGridFocusController, type GalleryGridFocusOptions } from './grid-focus-controller';

/** React lifecycle adapter for the single local focus transaction. */
export function useGalleryGridFocus(options: GalleryGridFocusOptions) {
  const [activeId, setActiveId] = useState<string | null>(options.units[0]?.id ?? null);
  const controllerRef = useRef<GalleryGridFocusController | null>(null);
  if (!controllerRef.current)
    controllerRef.current = new GalleryGridFocusController(options, setActiveId);
  const controller = controllerRef.current;
  controller.options = options;
  useLayoutEffect(() => {
    controller.reconcile();
  }, [controller, options]);
  useEffect(() => controller.listen(), [controller]);
  return { activeId, active: controller.active, focusUnit: controller.focusUnit };
}
