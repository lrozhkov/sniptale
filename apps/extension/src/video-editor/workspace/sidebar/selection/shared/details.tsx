import type { ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

/** Native disclosure keeps editing controls mounted while its contents are collapsed. */
export function InspectorDetails(props: {
  label: string;
  children: ReactNode;
  icon?: LucideIcon;
  initiallyOpen?: boolean;
  level?: 'section' | 'group';
}) {
  const Icon = props.icon;
  const Heading = props.level === 'section' ? 'h3' : 'h4';
  return (
    <details
      data-ui="video-editor.inspector.disclosure"
      data-level={props.level ?? 'group'}
      open={props.initiallyOpen}
    >
      <summary>
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        <Heading>{props.label}</Heading>
        <ChevronDown size={props.level === 'section' ? 16 : 14} aria-hidden="true" />
      </summary>
      <div className="space-y-2 pt-2">{props.children}</div>
    </details>
  );
}
