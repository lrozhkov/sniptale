import { ChevronDown } from 'lucide-react';
import type { InspectorDisclosureProps } from './shared';
/** Native disclosure presentation; workspace owners retain preference identity and persistence. */
export function InspectorDisclosureView(
  props: Omit<InspectorDisclosureProps, 'preferenceId' | 'initiallyOpen'> & {
    dataUi: string;
    bodyClassName: string;
    open: boolean;
    onOpenChange(open: boolean): void;
  }
) {
  const level = props.level ?? 'group';
  const Heading = level === 'section' ? 'h3' : 'h4';
  const Icon = props.icon;
  return (
    <details
      data-ui={props.dataUi}
      data-level={level}
      open={props.open}
      onToggle={(event) => {
        if (event.currentTarget.open !== props.open) props.onOpenChange(event.currentTarget.open);
      }}
    >
      <summary>
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        <Heading>{props.label}</Heading>
        <ChevronDown size={level === 'section' ? 16 : 14} aria-hidden="true" />
      </summary>
      <div className={props.bodyClassName}>{props.children}</div>
    </details>
  );
}
