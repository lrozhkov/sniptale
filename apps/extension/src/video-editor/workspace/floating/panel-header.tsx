import type { ReactNode } from 'react';
import { ContentToolbarButton, type ContentToolbarButtonProps } from '@sniptale/ui/content-toolbar';

/** Both side panels share the content height and keep their divider outside it. */
export function WorkspacePanelHeader(props: { children: ReactNode; actions: ReactNode }) {
  return (
    <header className="shrink-0 border-b border-[color:var(--sniptale-color-border-soft)]">
      <div className="flex h-13 min-w-0 items-center gap-2 px-3">
        <div className="min-w-0 flex-1">{props.children}</div>
        <div className="flex shrink-0 items-center gap-1">{props.actions}</div>
      </div>
    </header>
  );
}

export function WorkspacePanelButton(props: Omit<ContentToolbarButtonProps, 'className'>) {
  return (
    <ContentToolbarButton
      type="button"
      {...props}
      className={[
        '!h-7 !w-7 !min-w-7 !p-0 !rounded-md',
        'text-[var(--sniptale-color-text-muted)] [&_svg]:size-4',
      ].join(' ')}
    />
  );
}
