// Capture Source Manager — управление получением streamId для разных режимов захвата

import { browserTabCapture } from '@sniptale/platform/browser/tab-capture';
import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { CaptureSource } from '@sniptale/runtime-contracts/video/types/types';
import { getScreenCaptureSource } from './screen-source';

export function createCaptureModeService() {
  let pendingCaptureSource: CaptureSource | null = null;

  function setPendingCaptureSource(source: CaptureSource | null): void {
    pendingCaptureSource = source;
  }

  function getPendingCaptureSource(): CaptureSource | null {
    return pendingCaptureSource;
  }

  return {
    setPendingCaptureSource,
    getPendingCaptureSource,
  };
}

const defaultCaptureModeService = createLazyDefaultOwner(createCaptureModeService);

/**
 * Получает streamId для режима TAB (активная вкладка)
 */
export async function getTabStreamId(tabId: number): Promise<CaptureSource> {
  const streamId = await browserTabCapture.getMediaStreamId({ targetTabId: tabId });
  return {
    mode: CaptureMode.TAB,
    streamId,
    tabId,
  };
}

/**
 * Получает streamId для режима TAB_CROP (область вкладки)
 * Сначала получает streamId вкладки, затем отправляет запрос на выбор области
 */
export async function getTabCropStreamId(tabId: number): Promise<CaptureSource> {
  const baseSource = await getTabStreamId(tabId);

  return {
    ...baseSource,
    mode: CaptureMode.TAB_CROP,
  };
}

/**
 * Получает streamId для режима SCREEN (весь экран)
 * Показывает системный диалог выбора экрана
 * @param tab - Объект вкладки (обязателен для вызова chooseDesktopMedia)
 */
export async function getScreenStreamId(tab: chrome.tabs.Tab): Promise<CaptureSource> {
  return getScreenCaptureSource(tab);
}

/**
 * Главная функция — получение CaptureSource по режиму захвата
 * @param mode - Режим захвата
 * @param tab - Объект вкладки (обязателен для всех режимов)
 */
export async function getCaptureSource(
  mode: CaptureMode,
  tab: chrome.tabs.Tab
): Promise<CaptureSource> {
  const tabId = tab.id;

  switch (mode) {
    case CaptureMode.TAB:
      if (!tabId) throw new Error('TAB mode requires tabId');
      return getTabStreamId(tabId);

    case CaptureMode.TAB_CROP:
      if (!tabId) throw new Error('TAB_CROP mode requires tabId');
      return getTabCropStreamId(tabId);

    case CaptureMode.SCREEN:
      return getScreenStreamId(tab);

    case CaptureMode.CAMERA:
      return {
        mode: CaptureMode.CAMERA,
        streamId: 'camera',
      };

    case CaptureMode.VIEWPORT_EMULATION:
      if (!tabId) throw new Error('VIEWPORT_EMULATION mode requires tabId');
      return getTabStreamId(tabId);

    default:
      throw new Error(`Unknown capture mode: ${mode}`);
  }
}

/**
 * Обновляет captureSource информацией о tab
 */
export function enrichCaptureSourceWithTabInfo(
  source: CaptureSource,
  tab: { title?: string; url?: string; favIconUrl?: string }
): CaptureSource {
  return {
    ...source,
    ...(tab.title === undefined ? {} : { tabTitle: tab.title }),
    ...(tab.url === undefined ? {} : { tabUrl: tab.url }),
    ...(tab.favIconUrl === undefined ? {} : { tabFavicon: tab.favIconUrl }),
  };
}

/**
 * Обновляет captureSource с информацией о выбранной области (crop)
 */
export function updateCaptureSourceCropRegion(
  source: CaptureSource,
  cropRegion: { x: number; y: number; width: number; height: number }
): CaptureSource {
  return {
    ...source,
    cropRegion,
  };
}

/**
 * Сохраняет pending источник (до завершения выбора области)
 */
export function setPendingCaptureSource(source: CaptureSource | null): void {
  defaultCaptureModeService.getOwner().setPendingCaptureSource(source);
}

/**
 * Получает pending источник
 */
export function getPendingCaptureSource(): CaptureSource | null {
  return defaultCaptureModeService.getOwner().getPendingCaptureSource();
}

/**
 * Проверяет, поддерживает ли режим аннотации
 */
export function supportsAnnotations(mode: CaptureMode): boolean {
  return (
    mode === CaptureMode.TAB ||
    mode === CaptureMode.TAB_CROP ||
    mode === CaptureMode.VIEWPORT_EMULATION
  );
}

/**
 * Проверяет, поддерживает ли режим системный звук вкладки
 */
export function supportsSystemAudio(mode: CaptureMode): boolean {
  return (
    mode === CaptureMode.TAB ||
    mode === CaptureMode.TAB_CROP ||
    mode === CaptureMode.VIEWPORT_EMULATION
  );
}
