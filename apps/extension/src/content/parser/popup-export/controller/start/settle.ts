import type {
  ExportOptions,
  ExportProgress,
  ExportResult,
  PopupExportResult,
} from '@sniptale/runtime-contracts/export';
import type { ContentPrivilegedActionIntentSource } from '../../../../platform/privileged-action-intent/client';
import { resetPopupExportState } from '../state';
import type { PopupExportState } from '../types';
import { createPopupExportFailureResult } from './failure';
import { createPopupExportResult } from './result';

type PopupExportRunner = {
  export: (
    options: ExportOptions,
    context?: { contentIntentSource?: ContentPrivilegedActionIntentSource | undefined }
  ) => Promise<ExportResult>;
  onProgress: (callback: (progress: ExportProgress) => void) => void;
};

type PopupExportPersistArchive = (result: ExportResult) => Promise<string[]>;

export type PopupExportStartSettlementProps = {
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  exportRunner: PopupExportRunner;
  options: ExportOptions;
  persistArchive: PopupExportPersistArchive;
  requestId: string;
  state: PopupExportState;
};

export async function settlePopupExportStartFlow(
  props: PopupExportStartSettlementProps
): Promise<PopupExportResult | null> {
  let popupResult: PopupExportResult | null = null;

  try {
    const result = await props.exportRunner.export(props.options, {
      contentIntentSource: props.contentIntentSource,
    });

    if (props.state.activeExportRequestId !== props.requestId) {
      return null;
    }

    const persistErrors = result.success ? await props.persistArchive(result) : [];
    popupResult = createPopupExportResult(result, persistErrors);
  } catch (error) {
    popupResult = createPopupExportFailureResult(error);
  } finally {
    resetPopupExportState(props.state);
  }

  return popupResult;
}
