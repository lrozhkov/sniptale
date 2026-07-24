import type {
  ExportOptions,
  ExportResult,
  PopupExportResult,
} from '@sniptale/runtime-contracts/export';
import type { ContentPrivilegedActionIntentSource } from '../../../../platform/privileged-action-intent/client';
import { translate } from '../../../../../platform/i18n';
import { resetPopupExportState } from '../state';
import type { PopupExportRequestHandlerRuntime, PopupExportRunner } from '../types';

type PopupExportStartSettlementProps = Pick<
  PopupExportRequestHandlerRuntime,
  'persistArchive' | 'state'
> & {
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  exportRunner: Pick<PopupExportRunner, 'export'>;
  options: ExportOptions;
  requestId: string;
};

function createPopupExportFailureResult(error: unknown): PopupExportResult {
  return {
    success: false,
    errors: [error instanceof Error ? error.message : translate('content.runtime.exportFailed')],
    stats: {
      sectionsCount: 0,
      rowsCount: 0,
      filesCount: 0,
      filesFailed: 0,
    },
  };
}

function createPopupExportResult(result: ExportResult, persistErrors: string[]): PopupExportResult {
  const errors = [...result.errors, ...persistErrors];

  return {
    success: result.success && errors.length === 0,
    errors,
    stats: result.stats,
    ...(result.filename === undefined ? {} : { filename: result.filename }),
  };
}

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
