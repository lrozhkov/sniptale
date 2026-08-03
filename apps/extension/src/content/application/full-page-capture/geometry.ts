import type { FullPageCaptureGeometry } from '../../../contracts/full-page-capture';
import type { ScrollCaptureRoot } from './types';
import { measurePageScrollGeometry } from '../../platform/page-scroll';

export function measureCaptureGeometry(root: ScrollCaptureRoot): FullPageCaptureGeometry {
  const viewportWidth = Math.max(1, window.innerWidth);
  const viewportHeight = Math.max(1, window.innerHeight);
  const devicePixelRatio = Math.max(0.01, window.devicePixelRatio || 1);
  const scrollGeometry = measurePageScrollGeometry(root);
  if (root.kind === 'viewport') {
    return {
      devicePixelRatio,
      extentHeight: scrollGeometry.extentHeight,
      extentWidth: scrollGeometry.extentWidth,
      outputHeight: viewportHeight,
      outputWidth: viewportWidth,
      rootKind: root.kind,
      rootViewport: { height: viewportHeight, width: viewportWidth, x: 0, y: 0 },
      viewportHeight,
      viewportWidth,
    };
  }
  if (root.kind === 'document') {
    return {
      devicePixelRatio,
      extentHeight: scrollGeometry.extentHeight,
      extentWidth: scrollGeometry.extentWidth,
      outputHeight: scrollGeometry.extentHeight,
      outputWidth: scrollGeometry.extentWidth,
      rootKind: root.kind,
      rootViewport: { height: viewportHeight, width: viewportWidth, x: 0, y: 0 },
      viewportHeight,
      viewportWidth,
    };
  }
  const rect = root.element.getBoundingClientRect();
  const x = Math.max(0, rect.left + root.element.clientLeft);
  const y = Math.max(0, rect.top + root.element.clientTop);
  const width = Math.max(1, Math.min(root.element.clientWidth, viewportWidth - x));
  const height = Math.max(1, Math.min(root.element.clientHeight, viewportHeight - y));
  return {
    devicePixelRatio,
    extentHeight: scrollGeometry.extentHeight,
    extentWidth: scrollGeometry.extentWidth,
    outputHeight: y + scrollGeometry.extentHeight + Math.max(0, viewportHeight - (y + height)),
    outputWidth: x + scrollGeometry.extentWidth + Math.max(0, viewportWidth - (x + width)),
    rootKind: root.kind,
    rootViewport: { height, width, x, y },
    viewportHeight,
    viewportWidth,
  };
}

export function createLayoutGeneration(geometry: FullPageCaptureGeometry): string {
  return [
    geometry.rootKind,
    geometry.devicePixelRatio,
    geometry.viewportWidth,
    geometry.viewportHeight,
    geometry.extentWidth,
    geometry.extentHeight,
    geometry.rootViewport.x,
    geometry.rootViewport.y,
    geometry.rootViewport.width,
    geometry.rootViewport.height,
  ].join(':');
}
