import { useCallback } from 'react';
import { translate } from '../../../../../platform/i18n';
import { InspectorGroupSection } from './section';
import { useInspectorGroupFocusIntent } from './focus';
import { useRegisterInspectorGroupHeaderSlot } from './header-slot';
import { useInspectorGroups } from './state';
import { InspectorGroupSwitch } from './switch';
import type { InspectorGroupDefinition } from './types';

export function InspectorGroupedPanel<TId extends string>(props: {
  groups: readonly InspectorGroupDefinition<TId>[];
}) {
  const focusIntent = useInspectorGroupFocusIntent();
  const { activeGroup, setActiveGroupId, visibleGroups } = useInspectorGroups(
    props.groups,
    focusIntent
  );
  const onHeaderGroupChange = useCallback(
    (groupId: string) => setActiveGroupId(groupId as TId),
    [setActiveGroupId]
  );
  const switchSlot = activeGroup
    ? {
        ariaLabel: translate('videoEditor.sidebar.inspectorGroupSwitcherLabel'),
        activeGroupId: activeGroup.id,
        groups: visibleGroups,
        onChange: onHeaderGroupChange,
      }
    : null;
  const headerOwnsSwitch = useRegisterInspectorGroupHeaderSlot(switchSlot);

  if (!activeGroup || visibleGroups.length === 0 || !switchSlot) {
    return null;
  }

  return (
    <div className="space-y-3">
      {headerOwnsSwitch ? null : (
        <InspectorGroupSwitch
          ariaLabel={switchSlot.ariaLabel}
          activeGroupId={activeGroup.id}
          groups={visibleGroups}
          onChange={setActiveGroupId}
        />
      )}
      <InspectorGroupSection meta={activeGroup.meta}>{activeGroup.content}</InspectorGroupSection>
    </div>
  );
}
