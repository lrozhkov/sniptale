import type React from 'react';

export function EditorInspectorFramePreviewCard(props: {
  backgroundPreviewStyle: React.CSSProperties;
}) {
  return (
    <div
      className={
        'rounded-[16px] border border-[color:var(--sniptale-color-border-soft)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_78%,transparent)] p-3'
      }
    >
      <div
        data-testid="frame-preview"
        className="h-28 overflow-hidden rounded-[12px]"
        style={props.backgroundPreviewStyle}
      />
    </div>
  );
}
