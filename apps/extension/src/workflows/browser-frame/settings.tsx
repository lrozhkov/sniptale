import { SegmentedRow, TextField } from '../../ui/compact-inspector-controls';
import { useEffect, useState } from 'react';
import { type WindowHeader } from '../../features/browser-frame/header';
import { translate, useAppLocale } from '../../platform/i18n';
import { useWindowHeaderEditing, type WindowHeaderSettingsProps } from './editing';
import { WindowHeaderIconControls } from './icon-controls';
import { useInspectorLayout } from '../../ui/compact-inspector-controls/layout';

/** Shared controls for explicit window-header edits in image and video editors. */
export function WindowHeaderSettings({
  header,
  onChange,
  disabled = false,
  allowNone = true,
}: WindowHeaderSettingsProps) {
  useAppLocale();
  const inspector = useInspectorLayout();
  const editing = useWindowHeaderEditing({ header, onChange, disabled });
  return (
    <fieldset
      disabled={disabled}
      className={inspector ? 'sniptale-parameter-stack' : 'min-w-0 space-y-3'}
      data-ui="window-header-settings"
    >
      <HeaderSegments<'none' | WindowHeader['kind']>
        label={translate('windowHeader.type')}
        value={header?.kind ?? 'none'}
        options={[
          ...(allowNone ? [{ id: 'none' as const, label: translate('windowHeader.none') }] : []),
          { id: 'browser', label: translate('windowHeader.browser') },
          { id: 'application', label: translate('windowHeader.application') },
        ]}
        onChange={editing.changeKind}
      />
      {header ? (
        <>
          <HeaderSegments
            label={translate('windowHeader.style')}
            value={header.style}
            options={[
              { id: 'windows', label: translate('windowHeader.windows') },
              { id: 'macos', label: translate('windowHeader.macos') },
              { id: 'linux', label: translate('windowHeader.linux') },
            ]}
            onChange={(style) => editing.patch({ style })}
          />
          <HeaderSegments
            label={translate('windowHeader.theme')}
            value={header.theme}
            options={[
              { id: 'light', label: translate('windowHeader.light') },
              { id: 'dark', label: translate('windowHeader.dark') },
            ]}
            onChange={(theme) => editing.patch({ theme })}
          />
          <HeaderTextField
            label={translate(
              header.kind === 'browser' ? 'windowHeader.tabTitle' : 'windowHeader.windowTitle'
            )}
            value={header.title}
            maxLength={512}
            onCommit={(title) => editing.patch({ title })}
          />
          {header.kind === 'browser' ? (
            <div className="flex min-w-0 items-end gap-1.5">
              <HeaderTextField
                label={translate('windowHeader.address')}
                value={header.url}
                maxLength={2048}
                placeholder="example.com"
                onCommit={editing.changeAddress}
              />
              <WindowHeaderIconControls
                header={header}
                busy={editing.busy}
                onWebsite={editing.toggleFavicon}
                onClearFile={editing.clearFile}
                onFile={editing.loadFile}
              />
            </div>
          ) : null}
        </>
      ) : null}
      {editing.error ? (
        <p role="alert" className="text-xs text-[color:var(--sniptale-color-danger)]">
          {editing.error}
        </p>
      ) : null}
    </fieldset>
  );
}

function HeaderSegments<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const inspector = useInspectorLayout();
  if (inspector)
    return (
      <SegmentedRow
        label={label}
        columns={options.length === 2 ? 2 : 3}
        ariaLabel={label}
        value={value}
        options={options.map((option) => ({ value: option.id, label: option.label }))}
        onChange={onChange}
      />
    );
  return (
    <div className="min-w-0 space-y-1.5">
      <span
        className={[
          'text-[length:var(--sniptale-compact-font-size,12px)] font-semibold',
          'text-[color:var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        {label}
      </span>
      <SegmentedRow
        columns={options.length === 2 ? 2 : 3}
        ariaLabel={label}
        value={value}
        options={options.map((option) => ({ value: option.id, label: option.label }))}
        onChange={onChange}
      />
    </div>
  );
}

/** A field owns its disposable draft; expensive artwork updates only on completion. */
function HeaderTextField({
  label,
  value,
  maxLength,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  maxLength: number;
  placeholder?: string;
  onCommit: (value: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <TextField
      label={label}
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        const next = event.target.value.slice(0, maxLength).replace(/[\uD800-\uDFFF]/gu, '');
        if (next !== value) void onCommit(next);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.currentTarget.value = value;
          setDraft(value);
          event.currentTarget.blur();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
