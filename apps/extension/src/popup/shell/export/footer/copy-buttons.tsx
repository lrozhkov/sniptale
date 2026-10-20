import { Check, FileJson2 } from 'lucide-react';
import type { SVGProps } from 'react';

import { type PreviewFormat, cx } from '../selection/utils';
import {
  footerCopyButtonBaseClassName,
  footerCopyButtonDisabledClassName,
  footerCopyButtonEnabledClassName,
} from './tokens';

function MarkdownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M5 15V9l3 3 3-3v6m6-6v6m-2-2 2 2 2-2" />
    </svg>
  );
}

function FooterCopyButton(props: {
  copiedFormat: PreviewFormat | null;
  disabled: boolean;
  format: PreviewFormat;
  icon: typeof FileJson2 | typeof MarkdownIcon;
  onClick: () => void;
  title: string;
}) {
  const isCopied = props.copiedFormat === props.format;
  const Icon = isCopied ? Check : props.icon;

  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      aria-label={props.title}
      className={cx(
        footerCopyButtonBaseClassName,
        props.disabled ? footerCopyButtonDisabledClassName : footerCopyButtonEnabledClassName
      )}
    >
      <Icon
        className={cx(
          'h-[18px] w-[18px] shrink-0 transition-transform duration-200 ease-out',
          'group-hover:scale-110 group-focus-visible:scale-110',
          'group-hover:brightness-110 group-focus-visible:brightness-110',
          'group-disabled:scale-100 group-disabled:brightness-100 motion-reduce:transition-none',
          isCopied
            ? 'text-[var(--sniptale-color-success)]'
            : [
                'text-[var(--sniptale-color-text-secondary)]',
                'group-hover:text-[var(--sniptale-color-text-primary)]',
                'group-focus-visible:text-[var(--sniptale-color-text-primary)]',
              ].join(' ')
        )}
      />
    </button>
  );
}

export function ExportFooterCopyButtons(props: {
  canCopyJson: boolean;
  canCopyMarkdown: boolean;
  copyJsonTitle: string;
  copyMarkdownTitle: string;
  copiedFormat: PreviewFormat | null;
  onCopyJson: () => void;
  onCopyMarkdown: () => void;
}) {
  return (
    <>
      <FooterCopyButton
        copiedFormat={props.copiedFormat}
        disabled={!props.canCopyJson}
        format="json"
        icon={FileJson2}
        title={props.copyJsonTitle}
        onClick={props.onCopyJson}
      />
      <FooterCopyButton
        copiedFormat={props.copiedFormat}
        disabled={!props.canCopyMarkdown}
        format="markdown"
        icon={MarkdownIcon}
        title={props.copyMarkdownTitle}
        onClick={props.onCopyMarkdown}
      />
    </>
  );
}
