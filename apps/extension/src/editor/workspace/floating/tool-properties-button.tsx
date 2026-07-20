import type React from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { FloatingChromePanel, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import type { FloatingToolbarGroup } from './canvas-toolbar-model';
import { useToolPropertiesPopoverLayout } from './tool-properties-popover-layout';

const TOOL_PROPERTIES_POPOVER_CLASS_NAME = floatingChromeClassNames(
  'absolute left-[calc(100%+0.75rem)] top-[var(--editor-tool-properties-popover-top)]',
  'z-50 max-h-[var(--editor-floating-popover-max-height)]',
  'overflow-y-auto p-3 [scrollbar-gutter:stable_both-edges]',
  'max-[720px]:bottom-[calc(100%+0.75rem)] max-[720px]:left-0',
  'max-[720px]:top-auto max-[720px]:translate-y-0'
);

const TOOL_PROPERTIES_POPOVER_WIDTH_CLASS_NAMES: Record<
  NonNullable<FloatingToolbarGroup['width']>,
  string
> = {
  simple: 'w-[min(16rem,calc(100vw-6rem))]',
  style: 'w-[min(18rem,calc(100vw-6rem))]',
  rich: 'w-[min(22rem,calc(100vw-6rem))]',
  menu: 'w-[min(17rem,calc(100vw-6rem))]',
};

export function ToolPropertiesButton(props: {
  active: boolean;
  group: FloatingToolbarGroup;
  onToggle: (groupId: string) => void;
}) {
  const popoverLayout = useToolPropertiesPopoverLayout(props.active);

  return (
    <div className="relative">
      <ContentToolbarButton
        ref={popoverLayout.buttonRef}
        title={props.group.title}
        active={props.active}
        onClick={() => props.onToggle(props.group.id)}
        dataUi={`editor.floating.tool-properties.group.${props.group.id}`}
      >
        {props.group.trigger}
      </ContentToolbarButton>
      {props.active ? (
        <FloatingChromePanel
          ref={popoverLayout.popoverRef}
          dataUi={`editor.floating.tool-properties.popover.${props.group.id}`}
          className={[
            TOOL_PROPERTIES_POPOVER_CLASS_NAME,
            TOOL_PROPERTIES_POPOVER_WIDTH_CLASS_NAMES[props.group.width ?? 'style'],
          ].join(' ')}
          style={
            {
              '--editor-floating-popover-max-height': `${popoverLayout.layout.maxHeight}px`,
              '--editor-tool-properties-popover-top': `${popoverLayout.layout.top}px`,
            } as React.CSSProperties
          }
        >
          {props.group.content}
        </FloatingChromePanel>
      ) : null}
    </div>
  );
}
