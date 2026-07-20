import type React from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { translate } from '../../../../../platform/i18n';
import { saveSpoilerState } from '../../persistence/spoiler-state';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { resizeElement, type ResizePointerEvent } from './resize';

const logger = createLogger({ namespace: 'ContentAiDataPanelActions' });

export function createToggleSpoilerHandler(
  isDataSpoilerOpen: boolean,
  setIsDataSpoilerOpen: React.Dispatch<React.SetStateAction<boolean>>
) {
  return () => {
    const next = !isDataSpoilerOpen;
    setIsDataSpoilerOpen(next);
    // The spoiler preference is advisory-only: local UI state wins even if persistence fails.
    void saveSpoilerState(next);
  };
}

export function createDataResizeStartHandler(props: {
  dataContainerRef: React.RefObject<HTMLDivElement | null>;
  setIsDataResizing: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (event: ResizePointerEvent) =>
    resizeElement(event, props.dataContainerRef.current, props.setIsDataResizing);
}

export function createJsonResizeStartHandler(props: {
  jsonPreviewRef: React.RefObject<HTMLPreElement | null>;
  setIsJsonResizing: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (event: ResizePointerEvent) =>
    resizeElement(event, props.jsonPreviewRef.current, props.setIsJsonResizing);
}

export function createCopyFormattedJsonHandler(props: {
  formattedJSON: string;
  setCopied: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return () => runFormattedJsonCopyWorkflow(props);
}

function runFormattedJsonCopyWorkflow(props: {
  formattedJSON: string;
  setCopied: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  void navigator.clipboard
    .writeText(props.formattedJSON)
    .then(() => {
      props.setCopied(true);
      setTimeout(() => props.setCopied(false), 1500);
    })
    .catch((error) => {
      logger.error('Failed to copy formatted JSON to clipboard', error);
      props.setCopied(false);
      showToast(translate('content.runtime.copyTextFailed'), 'error');
    });
}

export function getSummaryToneClass(spoilerSummary: string) {
  if (spoilerSummary.startsWith(translate('aiModal.dataSummaryAllPrefix'))) {
    return 'sniptale-ai-summary--success';
  }
  if (spoilerSummary.startsWith(translate('aiModal.dataSummaryNone'))) {
    return 'sniptale-ai-summary--danger';
  }
  return 'sniptale-ai-summary--info';
}
