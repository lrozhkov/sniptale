import { MoveHorizontal } from 'lucide-react';

import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../support/provider';
import {
  ContentToolbarButton,
  ContentToolbarDivider,
  ContentToolbarDragHandle,
  ContentToolbarGroup,
  ContentToolbarShell,
  ContentToolbarSpacer,
} from '@sniptale/ui/content-toolbar';

const TOOLBAR_PREVIEW_STYLE = {
  position: 'relative',
  top: 'auto',
  left: 'auto',
} as const;

interface ToolbarPreviewCopy {
  close: string;
  cursor: string;
  highlight: string;
  reset: string;
}

export function buildToolbarShellPreview(): DesignSystemVariantPreview {
  return designSystemPreview(
    'shared.ui.content-toolbar',
    'shell',
    <DesignSystemFloatingPreviewFrame minHeight={120}>
      <ContentToolbarShell className="max-w-fit" style={TOOLBAR_PREVIEW_STYLE}>
        <ContentToolbarDragHandle>
          <MoveHorizontal className="h-4 w-4" />
        </ContentToolbarDragHandle>
        <ContentToolbarGroup>
          <ContentToolbarButton>A</ContentToolbarButton>
          <ContentToolbarButton active>B</ContentToolbarButton>
        </ContentToolbarGroup>
      </ContentToolbarShell>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildToolbarDragHandlePreview(): DesignSystemVariantPreview {
  return designSystemPreview(
    'shared.ui.content-toolbar',
    'drag-handle',
    <DesignSystemFloatingPreviewFrame minHeight={92}>
      <ContentToolbarDragHandle>
        <MoveHorizontal className="h-4 w-4" />
      </ContentToolbarDragHandle>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildToolbarGroupPreview(copy: ToolbarPreviewCopy): DesignSystemVariantPreview {
  return designSystemPreview(
    'shared.ui.content-toolbar',
    'group',
    <DesignSystemFloatingPreviewFrame minHeight={92}>
      <ContentToolbarGroup className="max-w-fit">
        <ContentToolbarButton>{copy.cursor}</ContentToolbarButton>
        <ContentToolbarButton active>{copy.highlight}</ContentToolbarButton>
      </ContentToolbarGroup>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildToolbarDividerPreview(copy: ToolbarPreviewCopy): DesignSystemVariantPreview {
  return designSystemPreview(
    'shared.ui.content-toolbar',
    'divider',
    <DesignSystemFloatingPreviewFrame minHeight={92}>
      <ContentToolbarShell className="max-w-fit px-3" style={TOOLBAR_PREVIEW_STYLE}>
        <ContentToolbarButton>{copy.cursor}</ContentToolbarButton>
        <ContentToolbarDivider />
        <ContentToolbarButton active>{copy.highlight}</ContentToolbarButton>
      </ContentToolbarShell>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildToolbarSpacerPreview(copy: ToolbarPreviewCopy): DesignSystemVariantPreview {
  return designSystemPreview(
    'shared.ui.content-toolbar',
    'spacer',
    <DesignSystemFloatingPreviewFrame minHeight={92}>
      <ContentToolbarShell className="w-full max-w-[320px]" style={TOOLBAR_PREVIEW_STYLE}>
        <ContentToolbarGroup>
          <ContentToolbarButton>{copy.cursor}</ContentToolbarButton>
        </ContentToolbarGroup>
        <ContentToolbarSpacer />
        <ContentToolbarGroup>
          <ContentToolbarButton tone="close">{copy.close}</ContentToolbarButton>
        </ContentToolbarGroup>
      </ContentToolbarShell>
    </DesignSystemFloatingPreviewFrame>
  );
}

export function buildToolbarChromePreviews(copy: ToolbarPreviewCopy): DesignSystemVariantPreview[] {
  return [
    buildToolbarDragHandlePreview(),
    buildToolbarGroupPreview(copy),
    buildToolbarDividerPreview(copy),
    buildToolbarSpacerPreview(copy),
  ];
}

export function buildToolbarButtonPreviews(copy: ToolbarPreviewCopy): DesignSystemVariantPreview[] {
  return [
    designSystemPreview(
      'shared.ui.content-toolbar',
      'button',
      <DesignSystemFloatingPreviewFrame minHeight={92}>
        <div className="flex gap-2">
          <ContentToolbarButton>{copy.cursor}</ContentToolbarButton>
          <ContentToolbarButton active>{copy.highlight}</ContentToolbarButton>
        </div>
      </DesignSystemFloatingPreviewFrame>
    ),
    designSystemPreview(
      'shared.ui.content-toolbar',
      'danger',
      <DesignSystemFloatingPreviewFrame minHeight={92}>
        <ContentToolbarButton tone="danger">{copy.reset}</ContentToolbarButton>
      </DesignSystemFloatingPreviewFrame>
    ),
    designSystemPreview(
      'shared.ui.content-toolbar',
      'close',
      <DesignSystemFloatingPreviewFrame minHeight={92}>
        <ContentToolbarButton tone="close">{copy.close}</ContentToolbarButton>
      </DesignSystemFloatingPreviewFrame>
    ),
  ];
}
