import type { JsonPreviewProps } from '../preview/types';
import { JsonPreviewBody } from './body';
import { JsonPreviewHeader } from './header';

export function JsonPreview({
  copied,
  copyFormattedJson,
  formattedJSON,
  handleJsonResizeStart,
  isJsonResizing,
  isLoading,
  jsonPreviewRef,
  setShowDataPreview,
  showDataPreview,
}: JsonPreviewProps) {
  return (
    <div>
      <JsonPreviewHeader
        copied={copied}
        copyFormattedJson={copyFormattedJson}
        formattedJSON={formattedJSON}
        isLoading={isLoading}
        setShowDataPreview={setShowDataPreview}
        showDataPreview={showDataPreview}
      />
      {showDataPreview && formattedJSON ? (
        <JsonPreviewBody
          formattedJSON={formattedJSON}
          handleJsonResizeStart={handleJsonResizeStart}
          isJsonResizing={isJsonResizing}
          jsonPreviewRef={jsonPreviewRef}
        />
      ) : null}
    </div>
  );
}
