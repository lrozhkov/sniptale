import type { ViewportCalibrationPattern } from '@sniptale/runtime-contracts/video/types/viewport-calibration';

// This content owner renders only the transient frame-verification marker.

type ViewportCalibrationBinding = {
  generation: number;
  recordingId: string;
  transitionId: string;
};

type ActiveViewportCalibration = ViewportCalibrationBinding & {
  host: HTMLElement;
};

let activeCalibration: ActiveViewportCalibration | null = null;

function bindingsEqual(
  left: ViewportCalibrationBinding,
  right: ViewportCalibrationBinding
): boolean {
  return (
    left.generation === right.generation &&
    left.recordingId === right.recordingId &&
    left.transitionId === right.transitionId
  );
}

function colorToCss(color: { blue: number; green: number; red: number }): string {
  return `rgb(${color.red}, ${color.green}, ${color.blue})`;
}

function styleEdge(
  edge: HTMLDivElement,
  placement: Partial<CSSStyleDeclaration>,
  color: { blue: number; green: number; red: number }
): void {
  Object.assign(edge.style, {
    background: colorToCss(color),
    display: 'block',
    margin: '0',
    padding: '0',
    pointerEvents: 'none',
    position: 'absolute',
    ...placement,
  });
}

function createMarkerHost(
  binding: ViewportCalibrationBinding,
  pattern: ViewportCalibrationPattern
): HTMLElement {
  const host = document.createElement('div');
  host.dataset['sniptaleViewportCalibration'] = binding.transitionId;
  host.popover = 'manual';
  Object.assign(host.style, {
    border: '0',
    boxSizing: 'border-box',
    height: '100dvh',
    inset: '0',
    margin: '0',
    maxHeight: 'none',
    maxWidth: 'none',
    padding: '0',
    pointerEvents: 'none',
    position: 'fixed',
    width: '100dvw',
    zIndex: '2147483647',
  });
  const root = host.attachShadow({ mode: 'open' });
  const thickness = `${pattern.edgeThicknessCss}px`;
  const top = document.createElement('div');
  const right = document.createElement('div');
  const bottom = document.createElement('div');
  const left = document.createElement('div');
  top.dataset['edge'] = 'top';
  right.dataset['edge'] = 'right';
  bottom.dataset['edge'] = 'bottom';
  left.dataset['edge'] = 'left';
  styleEdge(top, { height: thickness, left: '0', right: '0', top: '0' }, pattern.colors.top);
  styleEdge(
    bottom,
    { bottom: '0', height: thickness, left: '0', right: '0' },
    pattern.colors.bottom
  );
  styleEdge(
    left,
    { bottom: thickness, left: '0', top: thickness, width: thickness },
    pattern.colors.left
  );
  styleEdge(
    right,
    { bottom: thickness, right: '0', top: thickness, width: thickness },
    pattern.colors.right
  );
  root.append(top, right, bottom, left);
  return host;
}

function removeActiveCalibration(): void {
  const active = activeCalibration;
  activeCalibration = null;
  if (!active) return;
  if (typeof active.host.hidePopover === 'function') {
    try {
      active.host.hidePopover();
    } catch {
      // Removing the host is authoritative even when the popover was already closed by the page.
    }
  }
  active.host.remove();
}

export function showViewportCalibration(
  binding: ViewportCalibrationBinding,
  pattern: ViewportCalibrationPattern
): 'applied' {
  if (activeCalibration && bindingsEqual(activeCalibration, binding)) return 'applied';
  removeActiveCalibration();
  const host = createMarkerHost(binding, pattern);
  const parent = document.documentElement;
  if (!parent) throw new Error('Viewport calibration document root is unavailable');
  activeCalibration = { ...binding, host };
  try {
    parent.append(host);
    if (typeof host.showPopover === 'function') host.showPopover();
  } catch (error) {
    removeActiveCalibration();
    throw error;
  }
  return 'applied';
}

export function hideViewportCalibration(binding: ViewportCalibrationBinding): 'applied' | 'stale' {
  if (!activeCalibration || !bindingsEqual(activeCalibration, binding)) return 'stale';
  removeActiveCalibration();
  return 'applied';
}

export function disposeViewportCalibration(): void {
  removeActiveCalibration();
}
