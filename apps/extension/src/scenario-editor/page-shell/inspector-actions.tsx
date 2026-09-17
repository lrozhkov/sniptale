import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';

/**
 * One visual language for scenario inspector inline actions: quiet neutral
 * buttons, soft border on hover/focus and a hover-only danger presentation.
 */
export function ScenarioInspectorActionButton({
  tone = 'default',
  layout = 'row',
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'default' | 'danger';
  layout?: 'row' | 'icon';
  children: ReactNode;
}) {
  return (
    <ContentToolbarButton
      data-ui="scenario-editor.inspector-action"
      tone={tone}
      className={cx(
        'scenario-inspector-action',
        layout === 'icon' && 'scenario-inspector-action-icon',
        className
      )}
      {...props}
    >
      {children}
    </ContentToolbarButton>
  );
}

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}
