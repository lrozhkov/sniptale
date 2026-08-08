import React from 'react';

export interface FrameAnnotationDecorationProps {
  frameId: string;
  hideDuringCapture?: boolean;
  fillRef?: React.Ref<HTMLDivElement>;
  strokeRef?: React.Ref<HTMLDivElement>;
  fillStyle: React.CSSProperties;
  strokeStyle: React.CSSProperties;
}

/** The canonical frame DOM nodes used by content, editor projection, and offscreen export. */
export function FrameAnnotationDecoration(props: FrameAnnotationDecorationProps) {
  return (
    <>
      <div
        aria-hidden="true"
        className="sniptale-interactive-frame-fill"
        data-hide-during-capture={props.hideDuringCapture ? 'true' : undefined}
        data-frame-id={props.frameId}
        ref={props.fillRef}
        style={props.fillStyle}
      />
      <div
        aria-hidden="true"
        className="sniptale-interactive-frame-stroke"
        data-hide-during-capture={props.hideDuringCapture ? 'true' : undefined}
        data-frame-id={props.frameId}
        ref={props.strokeRef}
        style={props.strokeStyle}
      />
    </>
  );
}
