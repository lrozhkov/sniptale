import type React from 'react';
import { cx } from '../../chrome/ui';
import { EditorInspectorLayersHeader } from './header';

type LayerPanelFrameProps = {
  autoNavigateSelectedLayer: boolean;
  children: React.ReactNode;
  expanded: boolean;
  expandedHeight: number | null;
  fillContainer: boolean;
  frameRef: React.RefObject<HTMLDivElement | null>;
  headerRef: React.RefObject<HTMLDivElement | null>;
  layerCount: number;
  onCollapsePanel?: () => void;
  onToggle: () => void;
  onToggleAutoNavigateSelectedLayer: () => void;
};

export function LayerPanelFrame(props: LayerPanelFrameProps) {
  const frameStyle =
    props.fillContainer || !props.expanded || props.expandedHeight === null
      ? undefined
      : { height: `${props.expandedHeight}px` };

  return (
    <div
      ref={props.frameRef}
      data-ui="editor.layers.panel-frame"
      style={frameStyle}
      className={cx(
        'flex min-h-0 shrink-0 flex-col overflow-hidden border-t ' +
          'border-[color:var(--sniptale-color-border-soft)] transition-[height] duration-200',
        props.fillContainer && props.expanded ? 'h-full' : null,
        props.expanded ? null : 'h-14'
      )}
    >
      <div ref={props.headerRef} data-ui="editor.layers.panel-header">
        <EditorInspectorLayersHeader
          autoNavigateSelectedLayer={props.autoNavigateSelectedLayer}
          expanded={props.expanded}
          layerCount={props.layerCount}
          {...(props.onCollapsePanel === undefined
            ? {}
            : { onCollapsePanel: props.onCollapsePanel })}
          onToggle={props.onToggle}
          onToggleAutoNavigateSelectedLayer={props.onToggleAutoNavigateSelectedLayer}
        />
      </div>
      {props.children}
    </div>
  );
}
