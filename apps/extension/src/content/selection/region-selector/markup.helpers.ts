import { translate } from '../../../platform/i18n';
import {
  REGION_SELECTOR_INSTRUCTION_STYLE,
  REGION_SELECTOR_MASK_STYLE,
  REGION_SELECTOR_OVERLAY_STYLE,
  REGION_SELECTOR_RESIZE_HANDLES,
  REGION_SELECTOR_SURFACE_STYLE,
} from './markup.constants';

function createStyledDiv(style: string) {
  const div = document.createElement('div');
  div.style.cssText = style;
  return div;
}

function createResizeHandles() {
  return REGION_SELECTOR_RESIZE_HANDLES.map((handle) => {
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'sniptale-resize';
    resizeHandle.dataset['corner'] = handle.corner;
    resizeHandle.style.cssText = handle.style;
    return resizeHandle;
  });
}

function createInstructionBadge() {
  const badge = createStyledDiv(REGION_SELECTOR_INSTRUCTION_STYLE);
  badge.textContent = translate('content.overlayControls.regionInstruction');
  return badge;
}

function createOverlayMaskStyle(parts: string[]) {
  return parts.join(' ');
}

function createRegionOverlayMasks(currentRegion: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return [
    createOverlayMaskStyle([
      REGION_SELECTOR_MASK_STYLE,
      'top: 0;',
      'left: 0;',
      'right: 0;',
      `height: ${currentRegion.y}px;`,
    ]),
    createOverlayMaskStyle([
      REGION_SELECTOR_MASK_STYLE,
      `top: ${currentRegion.y + currentRegion.height}px;`,
      'left: 0;',
      'right: 0;',
      'bottom: 0;',
    ]),
    createOverlayMaskStyle([
      REGION_SELECTOR_MASK_STYLE,
      `top: ${currentRegion.y}px;`,
      'left: 0;',
      `width: ${currentRegion.x}px;`,
      `height: ${currentRegion.height}px;`,
    ]),
    createOverlayMaskStyle([
      REGION_SELECTOR_MASK_STYLE,
      `top: ${currentRegion.y}px;`,
      `left: ${currentRegion.x + currentRegion.width}px;`,
      'right: 0;',
      `height: ${currentRegion.height}px;`,
    ]),
  ];
}

function createRegionSurface(props: {
  currentRegion: { x: number; y: number; width: number; height: number };
}) {
  const region = createStyledDiv(
    [
      REGION_SELECTOR_SURFACE_STYLE,
      `left: ${props.currentRegion.x}px;`,
      `top: ${props.currentRegion.y}px;`,
      `width: ${props.currentRegion.width}px;`,
      `height: ${props.currentRegion.height}px;`,
    ].join(' ')
  );
  region.id = 'sniptale-region';
  region.append(...createResizeHandles());
  return region;
}

export function buildRegionSelectorMarkup(props: {
  currentRegion: { x: number; y: number; width: number; height: number };
}) {
  const fragment = document.createDocumentFragment();
  const overlay = createStyledDiv(REGION_SELECTOR_OVERLAY_STYLE);
  overlay.id = 'sniptale-overlay';

  createRegionOverlayMasks(props.currentRegion).forEach((style) => {
    const mask = createStyledDiv(style);
    mask.dataset['ui'] = 'content.region-mask';
    overlay.appendChild(mask);
  });

  overlay.append(createRegionSurface(props), createInstructionBadge());
  fragment.appendChild(overlay);
  return fragment;
}

export function updateOverlayMask(
  overlay: Element,
  currentRegion: { x: number; y: number; width: number; height: number }
) {
  const children = Array.from(overlay.children).slice(0, 4) as HTMLElement[];
  const topMask = children[0];
  const bottomMask = children[1];
  const leftMask = children[2];
  const rightMask = children[3];
  if (!topMask || !bottomMask || !leftMask || !rightMask) {
    return;
  }

  topMask.style.height = `${currentRegion.y}px`;
  bottomMask.style.top = `${currentRegion.y + currentRegion.height}px`;
  leftMask.style.top = `${currentRegion.y}px`;
  leftMask.style.width = `${currentRegion.x}px`;
  leftMask.style.height = `${currentRegion.height}px`;
  rightMask.style.top = `${currentRegion.y}px`;
  rightMask.style.left = `${currentRegion.x + currentRegion.width}px`;
  rightMask.style.height = `${currentRegion.height}px`;
}
