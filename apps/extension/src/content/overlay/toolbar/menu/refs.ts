import { useRef } from 'react';
import type { ViewportSelectorRef } from '../../viewport-selector';

export function useToolbarMenuRefs() {
  return {
    captureMenuRef: useRef<HTMLDivElement>(null),
    captureDropdownMenuRef: useRef<HTMLDivElement>(null),
    timerMenuRef: useRef<HTMLDivElement>(null),
    timerDropdownMenuRef: useRef<HTMLDivElement>(null),
    captureButtonRef: useRef<HTMLButtonElement>(null),
    timerButtonRef: useRef<HTMLButtonElement>(null),
    viewportWrapperRef: useRef<HTMLDivElement>(null),
    viewportSelectorRef: useRef<ViewportSelectorRef>(null),
  };
}
