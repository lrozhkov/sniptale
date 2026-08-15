import React from 'react';
import type { BrowserFrameState } from '../../../features/editor/document/types';
import { translate, useAppLocale } from '../../../platform/i18n';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import { TextField } from '../../chrome/ui';
import { PanelSection } from './shared';
import { BrowserFrameBehaviorSections, BrowserFrameInsertSection } from './browser-frame-sections';

function renderBrowserFrameTextInput(args: {
  action: string;
  describedBy?: string;
  invalid?: boolean;
  ariaLabel: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => Promise<void> | void;
}) {
  return (
    <TextField
      aria-label={args.ariaLabel}
      {...(args.describedBy === undefined ? {} : { 'aria-describedby': args.describedBy })}
      {...(args.invalid === undefined ? {} : { invalid: args.invalid })}
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
  return renderBrowserFrameTextInput({
    action: 'browser-frame-title',
    ariaLabel: translate('editor.compact.browserTabTitle'),
    label: translate('editor.compact.browserTabTitle'),
    placeholder: translate('editor.compact.pageTitlePlaceholder'),
    value: props.browserFrame.title,
    onChange: (title) => props.syncBrowserFrame({ title }),
  });
}

function getBrowserFrameValidationMessage(browserFrame: BrowserFrameState): string | null {
  return browserFrame.url.length > 2048 ? translate('editor.compact.browserFrameUrlTooLong') : null;
}

function BrowserFrameUrlSection(props: {
  browserFrame: BrowserFrameState;
  validationMessage: string | null;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void> | void;
}) {
  const errorId = 'editor-browser-frame-url-error';
  return (
    <div className="space-y-1.5">
      {renderBrowserFrameTextInput({
        action: 'browser-frame-url',
        ariaLabel: translate('editor.compact.urlMockup'),
        ...(props.validationMessage ? { describedBy: errorId } : {}),
        invalid: props.validationMessage !== null,
        label: translate('editor.compact.pageUrl'),
        placeholder: translate('editor.compact.urlPlaceholder'),
        value: props.browserFrame.url,
        onChange: (url) => props.syncBrowserFrame({ url }),
      })}
      {props.validationMessage ? (
        <p id={errorId} role="alert" className="text-xs text-[color:var(--sniptale-color-danger)]">
          {props.validationMessage}
        </p>
      ) : null}
    </div>
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
  const validationMessage = getBrowserFrameValidationMessage(browserFrame);

  return (
    <div className="space-y-3">
      <PanelSection label={translate('editor.compact.browserFrameLayout')}>
        <BrowserFrameBehaviorSections
          browserCanvasModeOptions={browserCanvasModeOptions}
          browserContentModeOptions={browserContentModeOptions}
          browserFrame={browserFrame}
          syncBrowserFrame={syncBrowserFrame}
        />
      </PanelSection>
      <PanelSection label={translate('editor.compact.browserFrameSettings')}>
        <div className="space-y-3">
          <BrowserFrameTitleSection
            browserFrame={browserFrame}
            syncBrowserFrame={syncBrowserFrame}
          />
          <BrowserFrameUrlSection
            browserFrame={browserFrame}
            validationMessage={validationMessage}
            syncBrowserFrame={syncBrowserFrame}
          />
        </div>
      </PanelSection>
      <BrowserFrameInsertSection
        disabled={validationMessage !== null}
        insertOrUpdateBrowserFrame={insertOrUpdateBrowserFrame ?? (() => undefined)}
      />
    </div>
  );
};
