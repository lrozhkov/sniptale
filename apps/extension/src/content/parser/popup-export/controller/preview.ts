import { translate } from '../../../../platform/i18n';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { buildPopupExportPreview, type PopupSendResponse } from '../helpers';

type PopupExportParseTree = (contextLabel: string) => Promise<ParsedDOMTree>;

export async function respondWithPopupPreview(props: {
  parseTree: PopupExportParseTree;
  sendResponse: PopupSendResponse;
}): Promise<void> {
  try {
    const tree: ParsedDOMTree = await props.parseTree('popup-export-preview');
    props.sendResponse({ success: true, preview: buildPopupExportPreview(tree) });
  } catch (error) {
    props.sendResponse({
      success: false,
      error:
        error instanceof Error ? error.message : translate('content.runtime.exportPrepareFailed'),
    });
  }
}
