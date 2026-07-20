import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import type { InspectorGroupDefinition } from './types';

export function InspectorGroupSwitch<TId extends string>(props: {
  activeGroupId: TId;
  ariaLabel: string;
  groups: readonly InspectorGroupDefinition<TId>[];
  onChange: (groupId: TId) => void;
}) {
  return (
    <SegmentedSwitch
      activeId={props.activeGroupId}
      ariaLabel={props.ariaLabel}
      options={props.groups}
      wrap={props.groups.length > 4}
      onChange={props.onChange}
    />
  );
}
