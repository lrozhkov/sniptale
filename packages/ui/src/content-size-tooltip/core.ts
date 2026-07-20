interface ContentSizeTooltipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContentSizeTooltipCopy {
  widthField: string;
  heightField: string;
  decreaseWidth: string;
  increaseWidth: string;
  decreaseHeight: string;
  increaseHeight: string;
  keepAspectRatio: string;
  cancel: string;
  confirm: string;
}

interface ContentSizeTooltipPositionOptions {
  anchorRect: ContentSizeTooltipRect;
  tooltipWidth?: number;
  tooltipHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  gap?: number;
  margin?: number;
  insideInset?: number;
}

type StyleRecord = Record<string, string | number>;

export const CONTENT_SIZE_TOOLTIP_DIMENSIONS = {
  width: 430,
  height: 46,
} as const;

const DEFAULT_GAP = 12;
const DEFAULT_MARGIN = 12;
const DEFAULT_INSIDE_INSET = 10;

function fitsWithinViewport(
  x: number,
  y: number,
  tooltipWidth: number,
  tooltipHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin: number
): boolean {
  return (
    x >= margin &&
    y >= margin &&
    x + tooltipWidth <= viewportWidth - margin &&
    y + tooltipHeight <= viewportHeight - margin
  );
}

function clampToViewport(
  x: number,
  y: number,
  tooltipWidth: number,
  tooltipHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin: number
) {
  return {
    x: Math.min(Math.max(x, margin), Math.max(margin, viewportWidth - tooltipWidth - margin)),
    y: Math.min(Math.max(y, margin), Math.max(margin, viewportHeight - tooltipHeight - margin)),
  };
}

function buildContentSizeTooltipCandidates(
  anchorRect: ContentSizeTooltipRect,
  tooltipWidth: number,
  tooltipHeight: number,
  gap: number,
  insideInset: number
) {
  return [
    { x: anchorRect.x, y: anchorRect.y - tooltipHeight - gap },
    {
      x: anchorRect.x + anchorRect.width - tooltipWidth,
      y: anchorRect.y - tooltipHeight - gap,
    },
    { x: anchorRect.x, y: anchorRect.y + anchorRect.height + gap },
    {
      x: anchorRect.x + anchorRect.width - tooltipWidth,
      y: anchorRect.y + anchorRect.height + gap,
    },
    { x: anchorRect.x + insideInset, y: anchorRect.y + insideInset },
    {
      x: anchorRect.x + anchorRect.width - tooltipWidth - insideInset,
      y: anchorRect.y + insideInset,
    },
    {
      x: anchorRect.x + insideInset,
      y: anchorRect.y + anchorRect.height - tooltipHeight - insideInset,
    },
    {
      x: anchorRect.x + anchorRect.width - tooltipWidth - insideInset,
      y: anchorRect.y + anchorRect.height - tooltipHeight - insideInset,
    },
  ];
}

export function calculateContentSizeTooltipPosition(options: ContentSizeTooltipPositionOptions): {
  x: number;
  y: number;
} {
  const tooltipWidth = options.tooltipWidth ?? CONTENT_SIZE_TOOLTIP_DIMENSIONS.width;
  const tooltipHeight = options.tooltipHeight ?? CONTENT_SIZE_TOOLTIP_DIMENSIONS.height;
  const viewportWidth = options.viewportWidth ?? window.innerWidth;
  const viewportHeight = options.viewportHeight ?? window.innerHeight;
  const gap = options.gap ?? DEFAULT_GAP;
  const margin = options.margin ?? DEFAULT_MARGIN;
  const insideInset = options.insideInset ?? DEFAULT_INSIDE_INSET;
  const { anchorRect } = options;
  const candidates = buildContentSizeTooltipCandidates(
    anchorRect,
    tooltipWidth,
    tooltipHeight,
    gap,
    insideInset
  );

  const fittingCandidate = candidates.find((candidate) =>
    fitsWithinViewport(
      candidate.x,
      candidate.y,
      tooltipWidth,
      tooltipHeight,
      viewportWidth,
      viewportHeight,
      margin
    )
  );

  if (fittingCandidate) {
    return fittingCandidate;
  }

  return clampToViewport(
    anchorRect.x + insideInset,
    anchorRect.y + insideInset,
    tooltipWidth,
    tooltipHeight,
    viewportWidth,
    viewportHeight,
    margin
  );
}

export function mergeStyleRecords(...styles: Array<StyleRecord | null | undefined>): StyleRecord {
  const merged: StyleRecord = {};
  for (const style of styles) {
    if (style) {
      Object.assign(merged, style);
    }
  }

  return merged;
}
