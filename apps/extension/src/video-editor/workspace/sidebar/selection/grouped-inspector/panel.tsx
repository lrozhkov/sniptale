import { useEffect, useRef, useState } from 'react';
import { InspectorGroupSection } from './section';
import { useInspectorGroupFocusIntent } from './focus';
import { resolveVisibleInspectorGroups } from './visibility';
import type { InspectorGroupDefinition } from './types';

export function InspectorGroupedPanel<TId extends string>(props: {
  groups: readonly InspectorGroupDefinition<TId>[];
}) {
  const groups = resolveVisibleInspectorGroups(props.groups);
  const defaultId =
    groups.find((group) => group.defaultActive && group.id !== 'info')?.id ??
    groups.find((group) => group.id !== 'info')?.id ??
    groups[0]?.id;
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(defaultId ? [defaultId] : []));
  const summaries = useRef(new Map<string, HTMLElement>());
  const consumedIntent = useRef<string | null>(null);
  const focusIntent = useInspectorGroupFocusIntent();
  const visibleIds = groups.map((group) => group.id).join('\u0000');

  const previousVisibleIds = useRef(visibleIds);
  useEffect(() => {
    const wasEmpty = previousVisibleIds.current === '';
    previousVisibleIds.current = visibleIds;
    const visible = new Set(visibleIds.split('\u0000'));
    setOpenIds((current) => {
      const remaining = [...current].filter((id) => visible.has(id));
      if (wasEmpty && defaultId && current.size === 0) return new Set([defaultId]);
      if (remaining.length === current.size) return current;
      return new Set(remaining.length ? remaining : defaultId ? [defaultId] : []);
    });
  }, [defaultId, visibleIds]);

  useEffect(() => {
    if (!focusIntent || consumedIntent.current === focusIntent.token) return;
    const summary = summaries.current.get(focusIntent.groupId);
    if (!summary) return;
    consumedIntent.current = focusIntent.token;
    setOpenIds((current) => new Set([...current, focusIntent.groupId]));
    summary.focus();
    summary.scrollIntoView?.({ block: 'nearest' });
  }, [focusIntent, visibleIds]);

  return (
    <div className="space-y-2" data-ui="video-editor.inspector.sections">
      {groups.map((group) => (
        <details
          key={group.id}
          open={openIds.has(group.id)}
          data-section={group.id}
          className={[
            'rounded-lg border border-[var(--sniptale-color-border-soft)]',
            'bg-[var(--sniptale-color-surface-panel)]',
          ].join(' ')}
        >
          <summary
            ref={(node) => {
              if (node) summaries.current.set(group.id, node);
              else summaries.current.delete(group.id);
            }}
            title={group.label}
            className={[
              'cursor-pointer rounded-lg px-3 py-2 text-sm font-medium',
              'text-[var(--sniptale-color-text-primary)] focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-[var(--sniptale-color-accent)]',
            ].join(' ')}
            onClick={(event) => {
              event.preventDefault();
              setOpenIds((current) => {
                const next = new Set(current);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                return next;
              });
            }}
          >
            {group.label}
          </summary>
          {openIds.has(group.id) ? (
            <div className="px-3 pb-3">
              <InspectorGroupSection meta={group.meta}>{group.content}</InspectorGroupSection>
            </div>
          ) : null}
        </details>
      ))}
    </div>
  );
}
