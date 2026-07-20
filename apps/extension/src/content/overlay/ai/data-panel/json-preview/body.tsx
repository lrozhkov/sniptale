import type React from 'react';
import { renderHighlightedJSON } from '../json/render';
import type { JsonPreviewProps } from '../preview/types';

type JsonPreviewBodyProps = Pick<
  JsonPreviewProps,
  'formattedJSON' | 'handleJsonResizeStart' | 'isJsonResizing' | 'jsonPreviewRef'
>;

export function JsonPreviewBody({
  formattedJSON,
  handleJsonResizeStart,
  isJsonResizing,
  jsonPreviewRef,
}: JsonPreviewBodyProps) {
  return (
    <div style={{ position: 'relative' }}>
      <pre ref={jsonPreviewRef as React.Ref<HTMLPreElement>} className="sniptale-json-preview">
        {renderHighlightedJSON(formattedJSON)}
      </pre>
      <div
        className={`sniptale-resizer ${isJsonResizing ? 'active' : ''}`}
        onMouseDown={handleJsonResizeStart}
      />
    </div>
  );
}
