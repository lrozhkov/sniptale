import { getContentUiElementById, resolveContentShadowRoot } from '../../platform/dom-host';
import { translate } from '../../../platform/i18n';

function createOverlayMaskSection(style: string) {
  const section = document.createElement('div');
  section.style.cssText = style;
  return section;
}

function createRecordingIndicator(props: { cssX: number; indicatorTop: number }) {
  const indicator = document.createElement('div');
  indicator.style.cssText =
    `position: absolute; left: ${props.cssX}px; top: ${props.indicatorTop}px;` +
    ' display: flex; align-items: center; gap: 8px;' +
    ' background: color-mix(in srgb, var(--sniptale-color-surface-panel) 88%, var(--sniptale-color-overlay) 12%);' +
    ' color: var(--sniptale-color-text-primary); padding: 4px 12px; border-radius: 6px;' +
    ' border: 1px solid var(--sniptale-color-border-soft); box-shadow: var(--sniptale-shadow-sm);' +
    ' font-size: 12px; font-family: system-ui;';

  const dot = document.createElement('span');
  dot.style.cssText =
    'width: 8px; height: 8px; background: var(--sniptale-color-danger);' +
    ' border-radius: 50%; animation: pulse 1s infinite;';

  const label = document.createElement('span');
  label.textContent = translate('content.overlayControls.regionRecordingLabel');

  indicator.append(dot, label);
  return indicator;
}

function ensureRecordingOverlayStyle() {
  let styleElement = getContentUiElementById<HTMLStyleElement>('sniptale-recording-overlay-style');
  if (styleElement) {
    return;
  }

  styleElement = document.createElement('style');
  styleElement.id = 'sniptale-recording-overlay-style';
  styleElement.textContent = '@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }';
  (resolveContentShadowRoot() ?? document.head).appendChild(styleElement);
}

function createRecordingOverlayMasks(props: {
  cssHeight: number;
  cssWidth: number;
  cssX: number;
  cssY: number;
}) {
  return [
    [
      'position: absolute;',
      'top: 0;',
      'left: 0;',
      'right: 0;',
      `height: ${props.cssY}px;`,
      'background: color-mix(in srgb, var(--sniptale-color-overlay) 72%, transparent);',
    ].join(' '),
    [
      'position: absolute;',
      `top: ${props.cssY + props.cssHeight}px;`,
      'left: 0;',
      'right: 0;',
      'bottom: 0;',
      'background: color-mix(in srgb, var(--sniptale-color-overlay) 72%, transparent);',
    ].join(' '),
    [
      'position: absolute;',
      `top: ${props.cssY}px;`,
      'left: 0;',
      `width: ${props.cssX}px;`,
      `height: ${props.cssHeight}px;`,
      'background: color-mix(in srgb, var(--sniptale-color-overlay) 72%, transparent);',
    ].join(' '),
    [
      'position: absolute;',
      `top: ${props.cssY}px;`,
      `left: ${props.cssX + props.cssWidth}px;`,
      'right: 0;',
      `height: ${props.cssHeight}px;`,
      'background: color-mix(in srgb, var(--sniptale-color-overlay) 72%, transparent);',
    ].join(' '),
  ];
}

export function buildRecordingOverlayNode(props: {
  cssHeight: number;
  cssWidth: number;
  cssX: number;
  cssY: number;
  indicatorTop: number;
}) {
  ensureRecordingOverlayStyle();

  const fragment = document.createDocumentFragment();
  createRecordingOverlayMasks(props).forEach((style) => {
    fragment.appendChild(createOverlayMaskSection(style));
  });
  fragment.appendChild(createRecordingIndicator(props));
  return fragment;
}
