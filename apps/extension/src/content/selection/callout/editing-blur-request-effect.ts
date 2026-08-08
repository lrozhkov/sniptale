import { useEffect } from 'react';
import { addCalloutBlurRequestListener } from '../../platform/page-context/frame-events';

export function useCalloutBlurRequestEffect(args: {
  contentEditableRef: React.RefObject<HTMLDivElement | null>;
  finishEditing: (editableElement?: HTMLDivElement | null) => void;
  frameId: string;
  isEditing: boolean;
}) {
  const { contentEditableRef, finishEditing, frameId, isEditing } = args;

  useEffect(() => {
    return addCalloutBlurRequestListener(({ frameId: requestedFrameId }) => {
      if (isEditing && requestedFrameId === frameId && contentEditableRef.current) {
        finishEditing(contentEditableRef.current);
        contentEditableRef.current.blur();
      }
    });
  }, [contentEditableRef, finishEditing, frameId, isEditing]);
}
