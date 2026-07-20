import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import type { CompactCommand } from './compact';

export function createTemplateHeaderState() {
  return {
    activeView: 'templates' as const,
    groups: [
      {
        id: 'system',
        label: 'System',
        templates: [
          {
            id: 'system-template',
            label: 'System template',
            preview: <span>system</span>,
            selected: true,
            onApply: vi.fn(),
          },
        ],
      },
    ],
    onOpenSavePanel: vi.fn(),
    onViewChange: vi.fn(),
    saveDisabled: false,
    savePanel: null,
    templates: [
      {
        id: 'system-template',
        label: 'System template',
        preview: <span>system</span>,
        selected: true,
        onApply: vi.fn(),
      },
    ],
  };
}

export function renderNode(node: React.ReactNode) {
  return renderToStaticMarkup(<>{node}</>);
}

function triggerNumericRows(node: React.ReactNode, value = 18) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) {
      return;
    }

    const props = child.props as {
      children?: React.ReactNode;
      onCommitValue?: (value: number) => void;
      onPreviewValue?: (value: number) => void;
    };
    props.onPreviewValue?.(value);
    props.onCommitValue?.(value);
    triggerGenericControlHandlers(props as Record<string, unknown>, value);
    if (shouldExpandComponent(child.type)) {
      triggerNumericRows(child.type(props as never), value);
    }
    triggerNumericRows(props.children, value);
  });
}

function triggerGenericControlHandlers(props: Record<string, unknown>, value: number) {
  (props['onPreviewChange'] as ((value: string) => void) | undefined)?.('#445566');
  (props['onPreviewReset'] as ((value: string) => void) | undefined)?.('#112233');
  const onChange = props['onChange'] as ((value: never) => void) | undefined;
  if (onChange) {
    const options = props['options'] as Array<{ value: string }> | undefined;
    const propValue = props['value'];
    if (typeof propValue === 'string' && propValue.startsWith('#')) {
      onChange('#445566' as never);
    } else if (options?.[0]) {
      onChange(options[0].value as never);
    } else if (typeof propValue === 'number') {
      onChange(value as never);
    }
  }
  void (props['onClick'] as (() => void | Promise<void>) | undefined)?.();
}

function shouldExpandComponent(type: unknown): type is (props: never) => React.ReactNode {
  return (
    typeof type === 'function' &&
    [
      'LineRange',
      'PercentRangeField',
      'RangeField',
      'RoughFillBaseControls',
      'RoughFillContent',
      'RichShapeEffectsSection',
      'RichShapeLineBody',
      'RichShapeLineColorField',
      'RichShapeLineRoughControls',
      'RichShapeLineSection',
      'RichShapeReflectionControls',
      'RichShapeRoughFillColorControl',
      'RichShapeRoughFillControls',
      'RichShapeRoughFillPatternControls',
      'RichShapeRoughFillStyleControl',
      'RichShapeRoughFillTextureControls',
      'RichShapeShadowControls',
      'RichShapeTextBody',
      'RichShapeTextAlignButtons',
      'RichShapeTextInsetFields',
      'RichShapeTextOptionButtons',
      'RichShapeTextSection',
      'RichShapeTextStyleButtons',
      'RichShapeTextVerticalAlignButtons',
      'IconToggleButton',
      'ShadowAngleSection',
      'ShadowBlurSection',
      'ShadowColorControl',
      'ShadowCommandContent',
      'ShadowDistanceSection',
      'ShadowRangeSection',
      'ShadowRangeControl',
      'SourceImageRangeControl',
      'SourceImageRangeSection',
    ].includes(type.name)
  );
}

export function exerciseNode(node: React.ReactNode, value = 18) {
  triggerNumericRows(node, value);
  return renderNode(node);
}

export function exerciseCommands(commands: Array<CompactCommand | null>, value = 18) {
  const liveCommands = commands.filter((command): command is CompactCommand => command !== null);
  liveCommands.forEach((command) => {
    void command.onClick?.();
    triggerNumericRows(command.content, value);
    renderNode(
      <div>
        {command.trigger}
        {command.content}
      </div>
    );
  });
  return liveCommands.map((command) => command.id);
}
