import type { ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

/** Native disclosure keeps editing controls mounted while its contents are collapsed. */
export function InspectorDetails(props: {
  label: string;
  children: ReactNode;
  icon?: LucideIcon;
  initiallyOpen?: boolean;
}) {
  const Icon = props.icon;
  return (
    <details data-ui="video-editor.inspector.disclosure" open={props.initiallyOpen}>
      <summary>
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        <h3>{props.label}</h3>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="space-y-2 pt-2">{props.children}</div>
    </details>
  );
}
