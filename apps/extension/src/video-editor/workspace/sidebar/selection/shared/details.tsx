import { InspectorDisclosureView } from '../../../../../ui/compact-inspector-controls/disclosure';
import type { InspectorDisclosureProps } from '../../../../../ui/compact-inspector-controls/shared';
import { useInspectorDisclosure } from '../../../../../composition/inspector-disclosures/state';
import type { ReactNode } from 'react';

type InspectorDetailsProps = Omit<InspectorDisclosureProps, 'children'> & {
  children: ReactNode | ((open: boolean) => ReactNode);
};

/** Fields stay mounted; render children can use the owned expansion state for costly media. */
export function InspectorDetails(props: InspectorDetailsProps) {
  const { children, ...disclosure } = props;
  const [open, setOpen] = useInspectorDisclosure(props.preferenceId, props.initiallyOpen ?? false);
  return (
    <InspectorDisclosureView
      {...disclosure}
      open={open}
      onOpenChange={setOpen}
      dataUi="video-editor.inspector.disclosure"
      bodyClassName="sniptale-parameter-stack space-y-2 pt-2"
    >
      {typeof children === 'function' ? children(open) : children}
    </InspectorDisclosureView>
  );
}
