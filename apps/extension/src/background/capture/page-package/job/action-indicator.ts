import { browserAction } from '@sniptale/platform/browser/action';
import { DEFAULT_COLOR_ACCENT } from '@sniptale/ui/default-colors/constants';
import { translate } from '../../../../platform/i18n';
import type { ActivePopupExportJob } from './runtime-state';

const ACTION_ICON_SIZES = [16, 32] as const;
const ACTION_ICON_FRAME_INTERVAL_MS = 420;
const POPUP_RESTORE_RETRY_DELAY_MS = 120;
const DEFAULT_ACTION_ICON_PATHS = {
  16: 'icons/icon-16.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};

type PagePackageActionIndicatorDeps = {
  openPopup: () => Promise<void>;
  renderFrame: (size: number, frame: number) => ImageData;
  setIcon: (details: Parameters<typeof chrome.action.setIcon>[0]) => Promise<void>;
  setTitle: (details: chrome.action.TitleDetails) => Promise<void>;
};

function renderCaptureIconFrame(size: number, frame: number): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Page Package action icon canvas is unavailable.');
  const center = size / 2;
  const radius = size * 0.43;
  context.fillStyle = '#15181d';
  context.beginPath();
  context.arc(center, center, size * 0.48, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = DEFAULT_COLOR_ACCENT;
  context.lineWidth = Math.max(2, size * 0.14);
  context.lineCap = 'round';
  context.beginPath();
  context.arc(
    center,
    center,
    radius,
    frame * (Math.PI / 3),
    frame * (Math.PI / 3) + Math.PI * 1.25
  );
  context.stroke();
  return context.getImageData(0, 0, size, size);
}

const DEFAULT_DEPS: PagePackageActionIndicatorDeps = {
  openPopup: () => browserAction.openPopup(),
  renderFrame: renderCaptureIconFrame,
  setIcon: (details) => browserAction.setIcon(details),
  setTitle: (details) => browserAction.setTitle(details),
};

export async function restorePagePackageProgressPopup(
  job: ActivePopupExportJob,
  windowId: number
): Promise<void> {
  if (job.cancelled || job.status.orderedTabs.length < 2) return;
  // Chrome can resolve openPopup while the popup closed by tab activation is still dismissing.
  await new Promise<void>((resolve) => setTimeout(resolve, POPUP_RESTORE_RETRY_DELAY_MS));
  if (job.cancelled) return;
  try {
    await browserAction.openPopup({ windowId });
  } catch {
    await new Promise<void>((resolve) => setTimeout(resolve, POPUP_RESTORE_RETRY_DELAY_MS));
    if (job.cancelled) return;
    await browserAction.openPopup({ windowId }).catch(() => undefined);
  }
}

export function startPagePackageActionIndicator(
  job: ActivePopupExportJob,
  deps: PagePackageActionIndicatorDeps = DEFAULT_DEPS
): () => Promise<void> {
  if (job.status.orderedTabs.length < 2) return async () => undefined;
  let frame = 0;
  const paint = () => {
    try {
      const imageData = Object.fromEntries(
        ACTION_ICON_SIZES.map((size) => [size, deps.renderFrame(size, frame)])
      );
      frame = (frame + 1) % 6;
      void Promise.resolve()
        .then(() => deps.setIcon({ imageData }))
        .catch(() => undefined);
    } catch {
      // Action presentation must never interrupt the capture authority.
    }
  };
  paint();
  void Promise.resolve()
    .then(() => deps.setTitle({ title: translate('popup.export.batchCollectingMessage') }))
    .catch(() => undefined);
  const timer = setInterval(paint, ACTION_ICON_FRAME_INTERVAL_MS);

  return async () => {
    clearInterval(timer);
    await Promise.resolve()
      .then(() => deps.setIcon({ path: DEFAULT_ACTION_ICON_PATHS }))
      .catch(() => undefined);
    await Promise.resolve()
      .then(() => deps.setTitle({ title: translate('background.runtime.actionOpenApp') }))
      .catch(() => undefined);
    if (!job.cancelled) {
      await Promise.resolve()
        .then(() => deps.openPopup())
        .catch(() => undefined);
    }
  };
}
