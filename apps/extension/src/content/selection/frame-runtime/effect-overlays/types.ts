import type { MutableRefObject } from 'react';

export type OverlayRefs = {
  focusOverlayRef: MutableRefObject<HTMLDivElement | null>;
  focusSvgRef: MutableRefObject<SVGSVGElement | null>;
  focusMaskIdRef: MutableRefObject<string>;
  blurOverlaysRef: MutableRefObject<Map<string, HTMLDivElement>>;
  blurFiltersSvgRef: MutableRefObject<SVGSVGElement | null>;
  blurFiltersIdRef: MutableRefObject<string>;
};
