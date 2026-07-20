import React from 'react';
import type { BrowserFrameState } from '../../../features/editor/document/types';
import { translate, useAppLocale } from '../../../platform/i18n';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import { TextField } from '../../chrome/ui';
import { PanelSection } from './shared';
import { BrowserFrameBehaviorSections, BrowserFrameInsertSection } from './browser-frame-sections';

function renderBrowserFrameTextInput(args: {
  action: string;
  ariaLabel: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => Promise<void> | void;
}) {
  return (
    <TextField
      aria-label={args.ariaLabel}
      label={args.label}
      placeholder={args.placeholder}
      value={args.value}
      onChange={(event) => {
        const nextValue = event.currentTarget.value;
        fireAndReportEditorAction(args.action, () => args.onChange(nextValue));
      }}
    />
  );
}

function BrowserFrameTitleSection(props: {
  browserFrame: BrowserFrameState;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void> | void;
}) {
  return (
    <PanelSection label={translate('editor.compact.browserTabTitle')}>
      {renderBrowserFrameTextInput({
        action: 'browser-frame-title',
        ariaLabel: translate('editor.compact.browserTabTitle'),
        label: translate('editor.compact.browserTabTitle'),
        placeholder: translate('editor.compact.pageTitlePlaceholder'),
        value: props.browserFrame.title,
        onChange: (title) => props.syncBrowserFrame({ title }),
      })}
    </PanelSection>
  );
}

function BrowserFrameUrlSection(props: {
  browserFrame: BrowserFrameState;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void> | void;
}) {
  return (
    <PanelSection label="URL">
      {renderBrowserFrameTextInput({
        action: 'browser-frame-url',
        ariaLabel: translate('editor.compact.urlMockup'),
        label: 'URL',
        placeholder: translate('editor.compact.urlPlaceholder'),
        value: props.browserFrame.url,
        onChange: (url) => props.syncBrowserFrame({ url }),
      })}
    </PanelSection>
  );
}

export const EditorInspectorBrowserFramePanelContent: React.FC<{
  browserCanvasModeOptions: { label: string; value: 'resize' | 'keep-size' }[];
  browserContentModeOptions: { label: string; value: 'push-down' | 'fit-content' }[];
  browserFrame: BrowserFrameState;
  insertOrUpdateBrowserFrame?: () => Promise<void> | void;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void> | void;
}> = ({
  browserCanvasModeOptions,
  browserContentModeOptions,
  browserFrame,
  insertOrUpdateBrowserFrame,
  syncBrowserFrame,
}) => {
  useAppLocale();

  return (
    <div className="space-y-3">
      <BrowserFrameBehaviorSections
        browserCanvasModeOptions={browserCanvasModeOptions}
        browserContentModeOptions={browserContentModeOptions}
        browserFrame={browserFrame}
        syncBrowserFrame={syncBrowserFrame}
      />
      <BrowserFrameTitleSection browserFrame={browserFrame} syncBrowserFrame={syncBrowserFrame} />
      <BrowserFrameUrlSection browserFrame={browserFrame} syncBrowserFrame={syncBrowserFrame} />
      <BrowserFrameInsertSection
        insertOrUpdateBrowserFrame={insertOrUpdateBrowserFrame ?? (() => undefined)}
      />
    </div>
  );
};
