import {
  createCopyFormattedJsonHandler,
  createDataResizeStartHandler,
  createJsonResizeStartHandler,
  createToggleSpoilerHandler,
} from '../interactions/panel';
import type { DataPanelActionBaseState, DataPanelActionDerivedState } from './action-types';

export function createAIModalDataPanelPanelActions(props: {
  base: DataPanelActionBaseState;
  derived: DataPanelActionDerivedState;
}) {
  return {
    copyFormattedJson: createCopyFormattedJsonHandler({
      formattedJSON: props.derived.formattedJSON,
      setCopied: props.base.setCopied,
    }),
    handleDataResizeStart: createDataResizeStartHandler({
      dataContainerRef: props.base.dataContainerRef,
      setIsDataResizing: props.base.setIsDataResizing,
    }),
    handleJsonResizeStart: createJsonResizeStartHandler({
      jsonPreviewRef: props.base.jsonPreviewRef,
      setIsJsonResizing: props.base.setIsJsonResizing,
    }),
    handleToggleSpoiler: createToggleSpoilerHandler(
      props.base.isDataSpoilerOpen,
      props.base.setIsDataSpoilerOpen
    ),
  };
}
