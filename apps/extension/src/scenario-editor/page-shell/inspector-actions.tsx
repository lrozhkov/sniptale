import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';

/**
 * One visual language for scenario inspector inline actions: neutral commands, explicit
 * navigation rows and separated destructive actions.
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
        tone === 'danger' && 'scenario-inspector-action-danger',
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

/** Returns from a nested inspector to its parent with one consistent label and direction. */
export function ScenarioInspectorBackButton({
  label,
  onBack,
}: {
  label: string;
  onBack: () => void;
}) {
  return (
    <ScenarioInspectorActionButton
      className="scenario-inspector-navigation"
      title={label}
      onClick={onBack}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {label}
    </ScenarioInspectorActionButton>
  );
}
