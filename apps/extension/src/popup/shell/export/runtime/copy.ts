import { getDefaultPopupExportRuntimeDeps } from './default-deps';
import { scheduleCopiedFormatReset } from './copied-format';
import { logPopupExportCopyFailure } from './logging';
import type { PopupExportRuntimeContract } from './state';
import type { PopupExportRuntimeDeps } from './types';
import { getPopupExportPreviewToCopy } from './preview-to-copy';

export async function copyPopupExportPreview(
  state: PopupExportRuntimeContract,
  format: 'json' | 'markdown',
  deps: PopupExportRuntimeDeps = getDefaultPopupExportRuntimeDeps()
): Promise<void> {
  if (!canCopyPopupExportPreview(state, format)) {
    return;
  }

  const requestId = state.copyRequestIdRef.current + 1;
  state.copyRequestIdRef.current = requestId;
  state.setCopyingFormat(format);

  try {
    const tabId = await deps.getActiveTabId();
    const preview = await deps.requestPreview(tabId, 'popup.export.prepareExportError');
    if (requestId !== state.copyRequestIdRef.current) {
      return;
    }

    const previewToCopy = getPopupExportPreviewToCopy(state, preview, format);
    if (!previewToCopy) {
      return;
    }

    await deps.writeClipboardText(previewToCopy);
    if (requestId !== state.copyRequestIdRef.current) {
      return;
    }

    scheduleCopiedFormatReset(state, format, deps);
  } catch (error) {
    if (requestId === state.copyRequestIdRef.current) {
      logPopupExportCopyFailure(error);
    }
  } finally {
    if (requestId === state.copyRequestIdRef.current) {
      state.setCopyingFormat(null);
    }
  }
}

function canCopyPopupExportPreview(
  state: Pick<PopupExportRuntimeContract, 'canCopyJson' | 'canCopyMarkdown'>,
  format: 'json' | 'markdown'
): boolean {
  return format === 'json' ? state.canCopyJson : state.canCopyMarkdown;
}
