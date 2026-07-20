import { DataSelectionArea, type DataSelectionAreaProps } from './data-selection-area';
import { JsonPreviewArea, type JsonPreviewAreaProps } from './json-preview-area';

type AIModalDataPanelContentProps = DataSelectionAreaProps & JsonPreviewAreaProps;

export function AIModalDataPanelContent(props: AIModalDataPanelContentProps) {
  return (
    <>
      <DataSelectionArea {...props} />
      <JsonPreviewArea {...props} />
    </>
  );
}
