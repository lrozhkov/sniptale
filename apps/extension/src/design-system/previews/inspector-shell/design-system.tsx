import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AppLocale } from '../../../platform/i18n';
import { getSharedPreviewCopy } from '../support/common';
import { designSystemPreview, type DesignSystemVariantPreview } from '../support/provider';
import {
  InspectorShellFrame,
  InspectorShellHeaderAction,
  InspectorShellPanel,
} from '@sniptale/ui/inspector-shell';

function renderInspectorShellFramePreview(shellContent: string) {
  return (
    <InspectorShellFrame
      expandedWidthClassName="w-full max-w-[360px]"
      collapsedWidthClassName="w-14"
    >
      <div
        className={[
          'flex h-20 w-full items-center justify-center rounded-[16px]',
          'border border-dashed border-[var(--sniptale-color-border-soft)]',
          'text-xs text-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        {shellContent}
      </div>
    </InspectorShellFrame>
  );
}

function renderInspectorShellPanelPreview(inspectorPanel: string, innerFlexColumn: string) {
  return (
    <div className="max-w-[360px]">
      <InspectorShellPanel
        className={['rounded-[16px] border border-[var(--sniptale-color-border-soft)] p-4'].join(
          ' '
        )}
      >
        <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {inspectorPanel}
        </div>
        <div className="mt-2 text-xs text-[var(--sniptale-color-text-secondary)]">
          {innerFlexColumn}
        </div>
      </InspectorShellPanel>
    </div>
  );
}

function renderInspectorShellHeaderActionPreview(copy: {
  header: string;
  back: string;
  forward: string;
}) {
  return (
    <div
      className={[
        'flex items-center rounded-[16px] border border-[var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)] px-3 py-2',
      ].join(' ')}
    >
      <span className="text-sm text-[var(--sniptale-color-text-secondary)]">{copy.header}</span>
      <div className="ml-auto flex gap-2">
        <InspectorShellHeaderAction title={copy.back} onClick={() => undefined}>
          <ChevronLeft className="h-4 w-4" />
        </InspectorShellHeaderAction>
        <InspectorShellHeaderAction title={copy.forward} onClick={() => undefined}>
          <ChevronRight className="h-4 w-4" />
        </InspectorShellHeaderAction>
      </div>
    </div>
  );
}

export function buildInspectorShellSharedPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getSharedPreviewCopy(locale);

  return [
    designSystemPreview(
      'shared.ui.inspector-shell',
      'frame',
      renderInspectorShellFramePreview(copy.shellContent)
    ),
    designSystemPreview(
      'shared.ui.inspector-shell',
      'panel',
      renderInspectorShellPanelPreview(copy.inspectorPanel, copy.innerFlexColumn)
    ),
    designSystemPreview(
      'shared.ui.inspector-shell',
      'header-action',
      renderInspectorShellHeaderActionPreview(copy)
    ),
  ];
}
