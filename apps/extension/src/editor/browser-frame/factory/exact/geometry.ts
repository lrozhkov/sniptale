import { EXACT_BROWSER_FRAME_REFERENCE } from './assets';

interface ResolveExactGeometryArgs {
  contentHeight: number;
  headerHeight: number;
  radius: number;
  width: number;
}

export interface ExactBrowserFrameGeometry {
  faviconSlot: ExactBrowserFrameSlotGeometry;
  header: {
    centerLeft: number;
    width: number;
    leftWidth: number;
    rightLeft: number;
    rightWidth: number;
  };
  bodyTop: number;
  contentHeight: number;
  radius: number;
  titleSlot: ExactBrowserFrameSlotGeometry;
  urlSlot: ExactBrowserFrameSlotGeometry;
}

interface ExactBrowserFrameSlotGeometry {
  height: number;
  left: number;
  radius: number;
  textBaseline: number;
  textLeft: number;
  top: number;
  width: number;
}

interface ExactBrowserFrameLayout {
  centerSourceWidth: number;
  centerWidth: number;
  leftWidth: number;
  scaleY: number;
}

export function resolveExactBrowserFrameGeometry(
  args: ResolveExactGeometryArgs
): ExactBrowserFrameGeometry {
  const scaleY = args.headerHeight / EXACT_BROWSER_FRAME_REFERENCE.headerHeight;
  const leftWidth = EXACT_BROWSER_FRAME_REFERENCE.leftSliceWidth * scaleY;
  const rightWidth = EXACT_BROWSER_FRAME_REFERENCE.rightSliceWidth * scaleY;
  const centerWidth = Math.max(120, args.width - leftWidth - rightWidth);
  const layout = createExactBrowserFrameLayout({
    centerWidth,
    leftWidth,
    scaleY,
  });

  return {
    bodyTop: Math.max(args.headerHeight - 1, 0),
    contentHeight: args.contentHeight,
    faviconSlot: mapSourceSlotToOutput(
      EXACT_BROWSER_FRAME_REFERENCE.faviconSlot,
      {
        baselineY: EXACT_BROWSER_FRAME_REFERENCE.faviconSlot.y,
        x: EXACT_BROWSER_FRAME_REFERENCE.faviconSlot.x,
      },
      layout,
      1
    ),
    header: {
      centerLeft: leftWidth,
      leftWidth,
      rightLeft: leftWidth + centerWidth,
      rightWidth,
      width: centerWidth,
    },
    radius: Math.max(6, args.radius),
    titleSlot: mapSourceSlotToOutput(
      EXACT_BROWSER_FRAME_REFERENCE.titleSlot,
      EXACT_BROWSER_FRAME_REFERENCE.titleText,
      layout
    ),
    urlSlot: mapSourceSlotToOutput(
      EXACT_BROWSER_FRAME_REFERENCE.urlSlot,
      EXACT_BROWSER_FRAME_REFERENCE.urlText,
      layout
    ),
  };
}

function createExactBrowserFrameLayout(args: {
  centerWidth: number;
  leftWidth: number;
  scaleY: number;
}): ExactBrowserFrameLayout {
  return {
    centerSourceWidth:
      EXACT_BROWSER_FRAME_REFERENCE.rightSliceX - EXACT_BROWSER_FRAME_REFERENCE.leftSliceWidth,
    centerWidth: args.centerWidth,
    leftWidth: args.leftWidth,
    scaleY: args.scaleY,
  };
}

function mapSourceSlotToOutput(
  slot: {
    height: number;
    radius: number;
    width: number;
    x: number;
    y: number;
  },
  text: {
    baselineY: number;
    x: number;
  },
  layout: ExactBrowserFrameLayout,
  minWidth = 80
): ExactBrowserFrameSlotGeometry {
  const left = mapSourceX(slot.x, layout);
  const right = mapSourceX(slot.x + slot.width, layout);

  return {
    height: slot.height * layout.scaleY,
    left,
    radius: slot.radius * layout.scaleY,
    textBaseline: text.baselineY * layout.scaleY,
    textLeft: mapSourceX(text.x, layout),
    top: slot.y * layout.scaleY,
    width: Math.max(minWidth, right - left),
  };
}

function mapSourceX(sourceX: number, layout: ExactBrowserFrameLayout): number {
  if (sourceX <= EXACT_BROWSER_FRAME_REFERENCE.leftSliceWidth) {
    return sourceX * layout.scaleY;
  }

  if (sourceX >= EXACT_BROWSER_FRAME_REFERENCE.rightSliceX) {
    const rightSourceOffset = sourceX - EXACT_BROWSER_FRAME_REFERENCE.rightSliceX;
    return layout.leftWidth + layout.centerWidth + rightSourceOffset * layout.scaleY;
  }

  const centerOffset = sourceX - EXACT_BROWSER_FRAME_REFERENCE.leftSliceWidth;
  return layout.leftWidth + (centerOffset * layout.centerWidth) / layout.centerSourceWidth;
}
