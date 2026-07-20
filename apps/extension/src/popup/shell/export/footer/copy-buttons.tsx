import { Braces, Check, FileText } from 'lucide-react';

import { type PreviewFormat, cx } from '../selection/utils';
import {
  footerCopyButtonBaseClassName,
  footerCopyButtonDisabledClassName,
  footerCopyButtonEnabledClassName,
} from './tokens';

function FooterCopyButton(props: {
  copiedFormat: PreviewFormat | null;
  disabled: boolean;
  format: PreviewFormat;
  icon: typeof Braces;
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
          'h-[18px] w-[18px] shrink-0',
          isCopied
            ? 'text-[var(--sniptale-color-success)]'
            : 'text-[var(--sniptale-color-text-primary)]'
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
        icon={Braces}
        title={props.copyJsonTitle}
        onClick={props.onCopyJson}
      />
      <FooterCopyButton
        copiedFormat={props.copiedFormat}
        disabled={!props.canCopyMarkdown}
        format="markdown"
        icon={FileText}
        title={props.copyMarkdownTitle}
        onClick={props.onCopyMarkdown}
      />
    </>
  );
}
