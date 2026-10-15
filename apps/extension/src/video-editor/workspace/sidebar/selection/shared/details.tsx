import { InspectorDisclosureView } from '../../../../../ui/compact-inspector-controls/disclosure';
import type { InspectorDisclosureProps } from '../../../../../ui/compact-inspector-controls/shared';
import { useInspectorDisclosure } from '../../../../../composition/inspector-disclosures/state';

/** Native disclosure keeps editing controls mounted while its contents are collapsed. */
export function InspectorDetails(props: InspectorDisclosureProps) {
  const [open, setOpen] = useInspectorDisclosure(props.preferenceId, props.initiallyOpen ?? false);
  return (
    <InspectorDisclosureView
      {...props}
      open={open}
      onOpenChange={setOpen}
      dataUi="video-editor.inspector.disclosure"
      bodyClassName="space-y-2 pt-2"
    />
  );
}
