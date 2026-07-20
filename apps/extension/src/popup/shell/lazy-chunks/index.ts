import { lazy } from 'react';
import { trackPopupPerfAsync } from '../../diagnostics/performance';

function loadVideoActivePageModule() {
  return trackPopupPerfAsync(
    'popup.chunk.video-active',
    () => import('../../recording/video/active-page')
  );
}

function loadVideoSetupPageModule() {
  return trackPopupPerfAsync(
    'popup.chunk.video-setup',
    () => import('../../recording/video/setup')
  );
}

function loadExportPageModule() {
  return trackPopupPerfAsync('popup.chunk.export', () => import('../export/pages/page'));
}

function loadPopupCommandPaletteModule() {
  return trackPopupPerfAsync('popup.chunk.command-palette', () => import('../command-palette'));
}

export const LazyVideoActivePage = lazy(async () => {
  return loadVideoActivePageModule();
});

export const LazyVideoSetupPage = lazy(async () => {
  return loadVideoSetupPageModule();
});

export const LazyExportPage = lazy(async () => {
  const module = await loadExportPageModule();
  return { default: module.ExportPage };
});

export const LazyPopupCommandPalette = lazy(async () => {
  return loadPopupCommandPaletteModule();
});

let popupDeferredViewsPromise: Promise<void> | null = null;

/**
 * Preloads popup views that are not part of the default home screen.
 */
export function preloadPopupDeferredViews(): Promise<void> {
  if (popupDeferredViewsPromise) {
    return popupDeferredViewsPromise;
  }

  popupDeferredViewsPromise = Promise.all([
    loadVideoActivePageModule(),
    loadVideoSetupPageModule(),
    loadExportPageModule(),
    loadPopupCommandPaletteModule(),
  ])
    .then(() => undefined)
    .catch((error) => {
      popupDeferredViewsPromise = null;
      throw error;
    });

  return popupDeferredViewsPromise;
}
