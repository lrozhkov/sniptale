import { useEffect } from 'react';
import { addCalloutBlurRequestListener } from '../../platform/page-context/frame-events';

export function useCalloutBlurRequestEffect(args: {
  contentEditableRef: React.RefObject<HTMLDivElement | null>;
  finishEditing: (editableElement?: HTMLDivElement | null) => void;
  frameId: string;
}) {
  const { contentEditableRef, finishEditing, frameId } = args;

  useEffect(() => {
    return addCalloutBlurRequestListener(({ frameId: requestedFrameId }) => {
      if (requestedFrameId === frameId && contentEditableRef.current) {
        finishEditing(contentEditableRef.current);
        contentEditableRef.current.blur();
      }
    });
  }, [contentEditableRef, finishEditing, frameId]);
}
