import type { CaptureImagePreparation } from '../application/ports';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { QuickActionAppearance } from '../../../contracts/quick-action-appearance';
import type { QuickActionHeaderRasterInput } from '../../../contracts/messaging/contracts/runtime-message/quick-action-appearance.types';
import { formatDateTime, getCurrentLocale, translate } from '../../../platform/i18n';
import {
  acquireMediaMutationPermit,
  getMediaAuthorityGeneration,
} from '../../mutation-exclusion/media-activity';
import { ensureOffscreenDocument, waitForOffscreenReady } from '../../offscreen-document/service';
import { createRuntimeMessagingTransport } from '../../../platform/runtime-messaging';
import { saveScreenshotToMediaHubFromDataUrl } from '../../media-hub/assets';
import {
  assertQuickActionAppearanceTransaction,
  getQuickActionAppearanceSnapshot,
} from './flow/surface';
import { renderQuickActionAppearance } from './appearance-render';
import type { QuickActionAppearanceMetadata } from '../../../features/quick-actions-presets/appearance';

interface AppearanceOutput {
  appearance?: QuickActionAppearance | undefined;
  imageFormat: 'png' | 'jpeg' | 'webp';
  imageQuality: number;
}

async function renderHeader(input: QuickActionHeaderRasterInput): Promise<string> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        await ensureOffscreenDocument('Render a quick-action window header');
        await waitForOffscreenReady();
        const response = await createRuntimeMessagingTransport().sendRuntimeMessage(
          attachOffscreenCommandCapability({
            type: MessageType.OFFSCREEN_QUICK_ACTION_HEADER,
            ...input,
          })
        );
        if (!response?.success)
          throw new Error(response?.error ?? 'Quick-action header rendering failed');
        return response.dataUrl;
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Quick-action header rendering timed out')),
          20_000
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function captureMetadata(tabId?: number): Promise<QuickActionAppearanceMetadata> {
  const date = formatDateTime(
    Date.now(),
    { dateStyle: 'medium', timeStyle: 'short' },
    getCurrentLocale()
  );
  if (tabId === undefined) return { date };
  const tab = await browserTabs.get(tabId).catch(() => null);
  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) return { date };
  return { date, url: tab.url, ...(tab.title ? { title: tab.title } : {}) };
}

function createPreparation(
  output: AppearanceOutput,
  assertCurrent: () => void,
  tabId?: number
): CaptureImagePreparation {
  return async (dataUrl, filename) => {
    assertCurrent();
    if (!output.appearance) return { dataUrl, filename };
    try {
      const metadata = await captureMetadata(tabId);
      assertCurrent();
      const rendered = await renderQuickActionAppearance({
        ...output,
        appearance: output.appearance,
        dataUrl,
        metadata,
        assertCurrent,
        renderHeader,
      });
      assertCurrent();
      return {
        dataUrl: rendered,
        filename: filename.replace(
          /\.[^.]+$/,
          `.${output.imageFormat === 'jpeg' ? 'jpg' : output.imageFormat}`
        ),
      };
    } catch (error) {
      assertCurrent();
      const extension = dataUrl.startsWith('data:image/jpeg;')
        ? 'jpg'
        : dataUrl.startsWith('data:image/webp;')
          ? 'webp'
          : 'png';
      try {
        await saveScreenshotToMediaHubFromDataUrl(
          dataUrl,
          filename.replace(/\.[^.]+$/, `.original.${extension}`),
          tabId,
          'temporary'
        );
      } catch (retentionError) {
        assertCurrent();
        throw new AggregateError(
          [error, retentionError],
          translate('content.runtime.quickActionAppearanceRetentionFailed'),
          { cause: retentionError }
        );
      }
      assertCurrent();
      throw new Error(translate('content.runtime.quickActionAppearanceFailed'), { cause: error });
    }
  };
}

/** Admission is synchronous and remains held through the caller's existing delivery. */
export function beginPageAppearance(
  tabId: number,
  transactionId?: string
): { prepare?: CaptureImagePreparation; assertCurrent(): void; release(): void } {
  if (transactionId === undefined) return { assertCurrent() {}, release() {} };
  const output = getQuickActionAppearanceSnapshot(tabId, transactionId);
  if (!output.appearance) return { assertCurrent() {}, release() {} };
  const releasePermit = acquireMediaMutationPermit();
  if (!releasePermit) throw new Error('Local data erasure is in progress');
  const generation = getMediaAuthorityGeneration();
  let released = false;
  const assertCurrent = () => {
    if (released || generation !== getMediaAuthorityGeneration())
      throw new Error('Quick-action appearance was cancelled');
    assertQuickActionAppearanceTransaction(tabId, transactionId);
  };
  return {
    prepare: createPreparation(output, assertCurrent, tabId),
    assertCurrent,
    release() {
      if (!released) {
        released = true;
        releasePermit();
      }
    },
  };
}

/** Desktop callers already hold their validated media reservation. */
export function prepareDesktopAppearance(
  output: AppearanceOutput,
  generation: number
): CaptureImagePreparation {
  return createPreparation(output, () => {
    if (generation !== getMediaAuthorityGeneration())
      throw new Error('Quick-action appearance was cancelled');
  });
}
