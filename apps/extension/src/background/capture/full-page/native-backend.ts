import { browserTabs } from '@sniptale/platform/browser/tabs';
import type { NativeVisibleCaptureLease } from '../visible/coordinator';
import type { FullPageRasterBackend } from './raster';

async function assertTargetIsActive(tabId: number, windowId: number): Promise<void> {
  const tab = await browserTabs.get(tabId);
  if (tab.windowId !== windowId || tab.active !== true) {
    throw new Error('Full-page capture target is no longer the active tab');
  }
  const [activeTab] = await browserTabs.query({ active: true, windowId });
  if (activeTab?.id !== tabId) {
    throw new Error('Full-page capture target changed while capturing');
  }
}

export async function createNativeFullPageRasterBackend(args: {
  lease: NativeVisibleCaptureLease;
  tabId: number;
}): Promise<FullPageRasterBackend> {
  const tab = await browserTabs.get(args.tabId);
  if (typeof tab.windowId !== 'number') {
    throw new Error('Full-page capture target window is unavailable');
  }
  const windowId = tab.windowId;
  return {
    async captureFrame() {
      let activationChanged = false;
      const unsubscribe = browserTabs.subscribeToActivated((activeInfo) => {
        if (activeInfo.windowId === windowId) activationChanged = true;
      });
      const assertStableTarget = async () => {
        if (activationChanged) {
          throw new Error('Full-page capture target changed while capturing');
        }
        await assertTargetIsActive(args.tabId, windowId);
        if (activationChanged) {
          throw new Error('Full-page capture target changed while capturing');
        }
      };
      try {
        await assertStableTarget();
        const dataUrl = await args.lease.capture(windowId, { format: 'png' }, assertStableTarget);
        await assertStableTarget();
        return dataUrl;
      } finally {
        unsubscribe();
      }
    },
    async release() {},
  };
}
