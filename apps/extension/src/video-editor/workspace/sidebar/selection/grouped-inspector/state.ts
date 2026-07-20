import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveFocusedInspectorGroupId, type InspectorGroupFocusIntent } from './focus';
import type { InspectorGroupDefinition } from './types';
import { resolveVisibleInspectorGroups } from './visibility';

export function useInspectorGroups<TId extends string>(
  groups: readonly InspectorGroupDefinition<TId>[],
  focusIntent: InspectorGroupFocusIntent | null = null
) {
  const visibleGroups = useMemo(() => resolveVisibleInspectorGroups(groups), [groups]);
  const defaultGroupId = resolveDefaultGroupId(visibleGroups);
  const [activeGroupId, setActiveGroupId] = useState<TId | null>(defaultGroupId);
  const focusedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (visibleGroups.length === 0) {
      setActiveGroupId(null);
      return;
    }

    if (activeGroupId && visibleGroups.some((group) => group.id === activeGroupId)) {
      return;
    }

    setActiveGroupId(defaultGroupId);
  }, [activeGroupId, defaultGroupId, visibleGroups]);

  useEffect(() => {
    if (!focusIntent || focusedTokenRef.current === focusIntent.token) {
      return;
    }

    const focusedGroupId = resolveFocusedInspectorGroupId(visibleGroups, focusIntent);
    if (!focusedGroupId) {
      return;
    }

    focusedTokenRef.current = focusIntent.token;
    setActiveGroupId(focusedGroupId);
  }, [focusIntent, visibleGroups]);

  const activeGroup =
    activeGroupId === null
      ? null
      : (visibleGroups.find((group) => group.id === activeGroupId) ?? null);

  return {
    activeGroup,
    activeGroupId,
    setActiveGroupId,
    visibleGroups,
  };
}

function resolveDefaultGroupId<TId extends string>(
  groups: readonly InspectorGroupDefinition<TId>[]
): TId | null {
  return (
    groups.find((group) => group.defaultActive)?.id ??
    groups.find((group) => group.id !== 'info')?.id ??
    groups[0]?.id ??
    null
  );
}
