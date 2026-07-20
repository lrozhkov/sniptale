import { popupLifecycleBootstrapLogger } from './logger';

export async function refreshPopupSecondaryState(args: {
  cancelledRef: () => boolean;
  refreshActiveTabCapabilities: () => Promise<void>;
  refreshGalleryStatus: () => Promise<void>;
}) {
  if (args.cancelledRef()) {
    return;
  }

  try {
    await Promise.all([args.refreshActiveTabCapabilities(), args.refreshGalleryStatus()]);
  } catch (error) {
    popupLifecycleBootstrapLogger.error('Failed to refresh popup secondary state', error);
  }
}
