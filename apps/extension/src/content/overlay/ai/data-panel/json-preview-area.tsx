import React from 'react';
import { JsonPreview } from './json-preview';

export type JsonPreviewAreaProps = {
  copied: boolean;
  copyFormattedJson: () => void;
  formattedJSON: string;
  handleJsonResizeStart: (event: React.MouseEvent) => void;
  isJsonResizing: boolean;
  isLoading: boolean;
  jsonPreviewRef: React.RefObject<HTMLPreElement | null>;
  setShowDataPreview: React.Dispatch<React.SetStateAction<boolean>>;
  showDataPreview: boolean;
};

export function JsonPreviewArea(props: JsonPreviewAreaProps) {
  return (
    <JsonPreview
      copied={props.copied}
      copyFormattedJson={props.copyFormattedJson}
      formattedJSON={props.formattedJSON}
      handleJsonResizeStart={props.handleJsonResizeStart}
      isJsonResizing={props.isJsonResizing}
      isLoading={props.isLoading}
      jsonPreviewRef={props.jsonPreviewRef}
      setShowDataPreview={props.setShowDataPreview}
      showDataPreview={props.showDataPreview}
    />
  );
}
