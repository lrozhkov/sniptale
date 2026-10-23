import { useContext, useRef } from 'react';
import { CommandPressScope, useCommandPress } from '@sniptale/ui/control-language/press';
import { FolderOpen, Globe, LoaderCircle } from 'lucide-react';
import type { WindowHeader } from '@sniptale/runtime-contracts/window-header';
import { translate } from '../../platform/i18n';
import { WINDOW_HEADER_ICON_ACCEPT } from './local-icon';

const buttonClass = [
  'flex h-[var(--sniptale-compact-control-height,32px)] w-8 shrink-0',
  'items-center justify-center rounded-[6px] border',
  'border-[color:var(--sniptale-color-border-soft)]',
  'text-[color:var(--sniptale-color-text-secondary)]',
  'hover:text-[color:var(--sniptale-color-text-primary)]',
  'aria-pressed:text-[color:var(--sniptale-color-accent)]',
  'focus-visible:outline focus-visible:outline-2',
  'focus-visible:outline-[color:var(--sniptale-color-border-accent-strong)]',
].join(' ');

/** Cancelling the native file chooser leaves project settings untouched. */
export function WindowHeaderIconControls(props: {
  header: WindowHeader;
  busy: 'site' | 'file' | null;
  onWebsite(): void;
  onClearFile(): void;
  onFile(file: File): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const scoped = useContext(CommandPressScope);
  const fileActive = props.header.faviconEnabled && props.header.faviconSource === 'file';
  const websitePress = useCommandPress({ enabled: scoped, onClick: props.onWebsite });
  const filePress = useCommandPress({
    enabled: scoped,
    disabled: props.busy === 'file',
    onClick: () => (fileActive ? props.onClearFile() : input.current?.click()),
  });
  return (
    <>
      <button
        type="button"
        className={buttonClass}
        aria-label={translate('windowHeader.favicon')}
        title={translate(props.busy === 'site' ? 'windowHeader.loading' : 'windowHeader.favicon')}
        aria-pressed={props.header.faviconEnabled && !fileActive}
        {...websitePress.props}
        data-command-press={scoped ? '' : undefined}
        data-pressing={websitePress.pressed ? 'true' : undefined}
      >
        <span className={scoped ? 'sniptale-command-content' : 'contents'}>
          {props.busy === 'site' ? (
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Globe size={16} aria-hidden="true" />
          )}
        </span>
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label={translate('windowHeader.fileIcon')}
        title={translate(
          props.busy === 'file'
            ? 'windowHeader.fileLoading'
            : fileActive
              ? 'windowHeader.fileRemove'
              : 'windowHeader.fileIcon'
        )}
        aria-pressed={fileActive}
        disabled={props.busy === 'file'}
        {...filePress.props}
        data-command-press={scoped ? '' : undefined}
        data-pressing={filePress.pressed ? 'true' : undefined}
      >
        <span className={scoped ? 'sniptale-command-content' : 'contents'}>
          {props.busy === 'file' ? (
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <FolderOpen size={16} aria-hidden="true" />
          )}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={WINDOW_HEADER_ICON_ACCEPT}
        data-ui="window-header-icon-file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) props.onFile(file);
        }}
      />
    </>
  );
}
