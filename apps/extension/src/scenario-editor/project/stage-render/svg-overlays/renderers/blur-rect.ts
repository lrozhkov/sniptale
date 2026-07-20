import type { ScenarioOverlay } from '../../../../../features/scenario/contracts/types/overlays';
import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { escapeSvgAttribute, formatNumber, projectRect } from '../../svg-overlays.helpers';
import {
  getScenarioBlurDisplacementScale,
  getScenarioBlurFill,
  resolveScenarioBlurSettings,
} from './blur-shared';

function createRectMarkup(rect: { x: number; y: number; width: number; height: number }) {
  return [
    `<rect x="${formatNumber(rect.x)}" y="${formatNumber(rect.y)}"`,
    ` width="${formatNumber(rect.width)}" height="${formatNumber(rect.height)}"`,
  ].join('');
}

function createStrokeDashArray(style: string, strokeWidth: number): string {
  switch (style) {
    case 'dash':
    case 'dashed':
      return ` stroke-dasharray="${formatNumber(Math.max(10, strokeWidth * 3))} ${formatNumber(
        Math.max(6, strokeWidth * 1.6)
      )}"`;
    case 'dot':
    case 'dotted':
      return ` stroke-dasharray="${formatNumber(Math.max(1, strokeWidth))} ${formatNumber(
        Math.max(6, strokeWidth * 1.9)
      )}"`;
    case 'dash-dot':
      return ` stroke-dasharray="${formatNumber(Math.max(10, strokeWidth * 3))} ${formatNumber(
        Math.max(6, strokeWidth * 1.6)
      )} ${formatNumber(Math.max(1, strokeWidth))} ${formatNumber(
        Math.max(6, strokeWidth * 1.9)
      )}"`;
    case 'long-dash':
      return ` stroke-dasharray="${formatNumber(Math.max(16, strokeWidth * 5))} ${formatNumber(
        Math.max(6, strokeWidth * 1.8)
      )}"`;
    case 'solid':
    default:
      return '';
  }
}

function insetRect(rect: { x: number; y: number; width: number; height: number }, inset: number) {
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(1, rect.width - inset * 2),
    height: Math.max(1, rect.height - inset * 2),
  };
}

function createFilterMarkup(
  blurId: string,
  settings: ReturnType<typeof resolveScenarioBlurSettings>
) {
  if (settings.blurType === 'solid') {
    return '';
  }

  if (settings.blurType === 'distortion') {
    return [
      `<filter id="${escapeSvgAttribute(blurId)}">`,
      `<feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="5" result="noise" />`,
      [
        '<feDisplacementMap in="SourceGraphic" in2="noise"',
        ` scale="${getScenarioBlurDisplacementScale(settings)}"`,
      ].join(''),
      ' xChannelSelector="R" yChannelSelector="G" /></filter>',
    ].join('');
  }

  return `<filter id="${escapeSvgAttribute(blurId)}"><feGaussianBlur stdDeviation="${
    settings.amount
  }" /></filter>`;
}

function createBlurLayerMarkup(
  assetDataUrl: string,
  imageRect: ScenarioStageLayout['imageRect'],
  blurId: string,
  clipId: string,
  settings: ReturnType<typeof resolveScenarioBlurSettings>
) {
  if (settings.blurType === 'solid') {
    return '';
  }

  return [
    `<image href="${escapeSvgAttribute(assetDataUrl)}"`,
    ` x="${formatNumber(imageRect.x)}"`,
    ` y="${formatNumber(imageRect.y)}"`,
    ` width="${formatNumber(imageRect.width)}" height="${formatNumber(imageRect.height)}"`,
    ` filter="url(#${escapeSvgAttribute(blurId)})" clip-path="url(#${escapeSvgAttribute(
      clipId
    )})" preserveAspectRatio="none" />`,
  ].join('');
}

export function renderBlurRectOverlay(
  assetDataUrl: string,
  layout: ScenarioStageLayout,
  overlay: Extract<ScenarioOverlay, { kind: 'blur-rect' }>,
  selected: boolean,
  stroke: string
) {
  const rect = projectRect(layout, overlay.rect);
  const blurId = `sniptaleScenarioBlur-${overlay.id}`;
  const clipId = `sniptaleScenarioBlurClip-${overlay.id}`;
  const settings = resolveScenarioBlurSettings(overlay.blurSettings);
  const showBorder = selected || settings.showBorder;
  const strokeWidth = showBorder ? (selected ? 3 : settings.strokeWidth) : 0;
  const clipInset = settings.showBorder ? settings.strokeWidth / 2 : 0;
  const clipRect = insetRect(rect, clipInset);
  const clipRadius = Math.max(0, settings.radius - clipInset);
  const rectMarkup = createRectMarkup(rect);
  const clipRectMarkup = createRectMarkup(clipRect);
  const filterMarkup = createFilterMarkup(blurId, settings);
  const blurLayer = createBlurLayerMarkup(assetDataUrl, layout.imageRect, blurId, clipId, settings);
  const borderMarkup = showBorder
    ? [
        rectMarkup,
        [
          ' fill="none"',
          ` stroke="${escapeSvgAttribute(selected ? stroke : settings.strokeColor)}"`,
          ` stroke-opacity="${formatNumber(selected ? 1 : settings.strokeOpacity)}"`,
          ` stroke-width="${formatNumber(strokeWidth)}"`,
          createStrokeDashArray(selected ? 'solid' : settings.strokeStyle, strokeWidth),
          ` rx="${formatNumber(settings.radius)}" ry="${formatNumber(settings.radius)}" />`,
        ].join(''),
      ].join('')
    : '';

  return [
    `<defs>${filterMarkup}`,
    `<clipPath id="${escapeSvgAttribute(clipId)}">${clipRectMarkup} rx="${formatNumber(
      clipRadius
    )}" ry="${formatNumber(clipRadius)}" /></clipPath></defs>`,
    [
      rectMarkup,
      ` fill="${escapeSvgAttribute(getScenarioBlurFill(settings))}"`,
      ` clip-path="url(#${escapeSvgAttribute(clipId)})"`,
      ` rx="${formatNumber(settings.radius)}" ry="${formatNumber(settings.radius)}" />`,
    ].join(''),
    blurLayer,
    borderMarkup,
  ].join('');
}
