import { useInspectorDisclosure } from '../../../composition/inspector-disclosures/state';
import type { ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

/**
 * Native disclosure keeps editing controls mounted while its contents are collapsed.
 * Passing `open`/`onToggle` binds the group to editor inspector state instead of the
 * persisted disclosure preference.
 */
export function EditorInspectorDetails(props: {
  label: string;
  preferenceId: string;
  children: ReactNode;
  icon?: LucideIcon;
  initiallyOpen?: boolean;
  level?: 'section' | 'group';
  meta?: ReactNode;
  open?: boolean;
  onToggle?: (open: boolean) => void;
}) {
  const [storedOpen, setStoredOpen] = useInspectorDisclosure(
    props.preferenceId,
    props.initiallyOpen ?? false
  );
  const controlled = props.open !== undefined;
  const open = props.open ?? storedOpen;
  const Icon = props.icon;
  const Heading = props.level === 'section' ? 'h3' : 'h4';
  return (
    <details
      data-ui="editor.inspector.disclosure"
      data-level={props.level ?? 'group'}
      open={open}
      onToggle={(event) => {
        if (event.currentTarget.open === open) return;
        if (controlled) {
          props.onToggle?.(event.currentTarget.open);
        } else {
          setStoredOpen(event.currentTarget.open);
        }
      }}
    >
      <summary>
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        <Heading>{props.label}</Heading>
        {props.meta !== undefined ? (
          <span data-ui="editor.inspector.disclosure-meta">{props.meta}</span>
        ) : null}
        <ChevronDown size={props.level === 'section' ? 16 : 14} aria-hidden="true" />
      </summary>
      <div className="space-y-2 pt-2">{props.children}</div>
    </details>
  );
}
