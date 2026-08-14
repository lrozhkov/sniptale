import { lazy } from 'react';
import { trackPopupPerfAsync } from '../../diagnostics/performance';
import type { PopupPage } from '../navigation/actions';
import { createPreloadableRouteResource } from './route-resource';

function loadVideoSetupPageModule() {
  return trackPopupPerfAsync(
    'popup.route.preload.video',
    () => import('../../recording/video/setup')
  );
}

function loadExportPageModule() {
  return trackPopupPerfAsync('popup.route.preload.export', () => import('../export/pages/page'));
}

function loadPopupCommandPaletteModule() {
  return trackPopupPerfAsync('popup.chunk.command-palette', () => import('../command-palette'));
}

export const LazyPopupCommandPalette = lazy(async () => {
  return loadPopupCommandPaletteModule();
});

const videoSetupRoute = createPreloadableRouteResource(async () => {
  const module = await loadVideoSetupPageModule();
  return module.default;
});

const exportRoute = createPreloadableRouteResource(async () => {
  const module = await loadExportPageModule();
  return module.ExportPage;
});

export function getResolvedVideoSetupPage() {
  return videoSetupRoute.getResolved();
}

export function getResolvedExportPage() {
  return exportRoute.getResolved();
}

export function isPopupPagePreloaded(page: PopupPage): boolean {
  if (page === 'video') return videoSetupRoute.getResolved() !== null;
  if (page === 'export') return exportRoute.getResolved() !== null;
  return true;
}

export async function preloadPopupPage(page: PopupPage): Promise<void> {
  if (page === 'video') {
    await videoSetupRoute.preload();
  } else if (page === 'export') {
    await exportRoute.preload();
  }
}

/**
 * Warms only the two top-level routes after the startup frame.
 */
export function preloadPopupDeferredViews(): Promise<void> {
  return Promise.all([preloadPopupPage('video'), preloadPopupPage('export')]).then(() => undefined);
}
