import { translate } from '../../../../platform/i18n';
import type { ExportProgressStepKey } from '@sniptale/runtime-contracts/export';
import type { PageSnapshotSource } from '../../page-snapshot/source';
import {
  prepareParsedPageSnapshot,
  type PreparedParsedPageSnapshot,
} from '../../dom-tree-parser/snapshot';
import type { ExportDiagnosticsSource } from '../diagnostics/source';
import { updateExportManagerProgress, type ExportManagerState } from './state';

export function createExportCancelledError(): Error {
  return new Error(translate('content.runtime.exportCancelled'));
}

export function getExportCompletedMessage(): string {
  return translate('content.runtime.exportCompleted');
}

export async function prepareExportManagerTreeData(
  state: ExportManagerState,
  snapshotSource?: PageSnapshotSource,
  activeStepKey?: ExportProgressStepKey
): Promise<PreparedParsedPageSnapshot> {
  updateExportManagerProgress(state, {
    ...(activeStepKey ? { activeStepKey } : {}),
    phase: 'scanning',
    message: translate('content.runtime.scanPageStructure'),
    current: 0,
    total: 0,
  });

  return prepareParsedPageSnapshot('export-manager', snapshotSource);
}

export function createExportDiagnosticsSource(
  snapshotSource?: PageSnapshotSource
): ExportDiagnosticsSource | undefined {
  if (!snapshotSource) {
    return undefined;
  }

  const sourceDocument = snapshotSource.document;
  const ambientWindow = typeof window === 'undefined' ? undefined : window;
  const ambientProtocol = ambientWindow?.location.protocol;
  const liveDocumentMatchesSource =
    sourceDocument.defaultView === null &&
    ambientWindow !== undefined &&
    (ambientProtocol === 'http:' || ambientProtocol === 'https:' || ambientProtocol === 'file:');
  const diagnosticsDocument = liveDocumentMatchesSource ? ambientWindow.document : sourceDocument;
  return {
    document: diagnosticsDocument,
    pageUrl: snapshotSource.pageUrl ?? undefined,
    view: liveDocumentMatchesSource ? ambientWindow : diagnosticsDocument.defaultView,
  };
}
