import './panel.css';
import { useWorkspacePreference } from '../../../../runtime/controller/workspace-preferences';
import { useInspectorSectionMemory } from './presentation';
import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Clock3,
  Frame,
  Info,
  Move,
  Paintbrush,
  Scan,
  Sparkles,
  Video,
  Waves,
  Type,
  History,
  SlidersHorizontal,
  Blend,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { translate } from '../../../../../platform/i18n';
import { InspectorGroupSection } from './section';
import { useInspectorGroupFocusIntent } from './focus';
import { resolveVisibleInspectorGroups } from './visibility';
import type { InspectorGroupDefinition, InspectorSectionSemantic } from './types';

const SECTION_ICONS: Readonly<Record<InspectorSectionSemantic, LucideIcon>> = {
  info: Info,
  timing: Clock3,
  placement: Move,
  framing: Frame,
  audio: AudioLines,
  canvas: Scan,
  background: Paintbrush,
  appearance: Paintbrush,
  camera: Video,
  animation: Waves,
  tracking: Scan,
  effects: Sparkles,
  content: Type,
  history: History,
  track: SlidersHorizontal,
  transition: Blend,
};

export function InspectorGroupedPanel<TId extends string>(props: {
  groups: readonly InspectorGroupDefinition<TId>[];
}) {
  const groups = resolveVisibleInspectorGroups(props.groups);
  const [presentation] = useWorkspacePreference('inspectorPresentation');
  const memory = useInspectorSectionMemory();
  const defaultId =
    groups.find((group) => group.id === memory.remembered)?.id ??
    groups.find((group) => group.defaultActive && group.semantic !== 'info')?.id ??
    groups.find((group) => group.semantic !== 'info')?.id ??
    groups[0]?.id;
  const surface = useRef<HTMLDivElement>(null);
  const consumedIntent = useRef<string | null>(null);
  const focusIntent = useInspectorGroupFocusIntent();
  const [request, setRequest] = useState<{ id: TId; token: number }>();
  const requestedGroup = groups.find((group) => group.id === focusIntent?.groupId);

  useEffect(() => {
    if (!focusIntent || !requestedGroup || consumedIntent.current === focusIntent.token) return;
    consumedIntent.current = focusIntent.token;
    setRequest((previous) => ({ id: requestedGroup.id, token: (previous?.token ?? 0) + 1 }));
    const button = [
      ...(surface.current?.querySelectorAll<HTMLButtonElement>('nav button') ?? []),
    ].find((candidate) => candidate.getAttribute('aria-label') === requestedGroup.label);
    if (presentation === 'all') {
      const section = [
        ...(surface.current?.querySelectorAll<HTMLElement>('[data-section]') ?? []),
      ].find((node) => node.dataset['section'] === requestedGroup.id);
      section?.scrollIntoView({ block: 'nearest' });
      section?.focus({ preventScroll: true });
    } else button?.focus();
  }, [focusIntent, requestedGroup, presentation]);

  if (!defaultId) return null;
  if (groups.length === 1) {
    const group = groups[0]!;
    return (
      <div ref={surface} data-ui="video-editor.inspector.sections" data-section={group.id}>
        <InspectorGroupSection meta={group.meta}>{group.content}</InspectorGroupSection>
      </div>
    );
  }
  if (presentation === 'all')
    return (
      <div
        ref={surface}
        data-ui="video-editor.inspector.sections"
        data-presentation="all"
        className="divide-y divide-[var(--sniptale-color-border-soft)]"
      >
        {groups.map((group) => {
          const Icon = SECTION_ICONS[group.semantic];
          return (
            <section
              key={group.id}
              data-section={group.id}
              tabIndex={-1}
              aria-label={group.label}
              className="py-4 first:pt-0 last:pb-0 focus:outline-none"
            >
              <h3
                data-ui="video-editor.inspector.section-heading"
                className={[
                  'mb-3 flex items-center gap-2 text-[13px] font-semibold',
                  'text-[var(--sniptale-color-text-primary)]',
                ].join(' ')}
              >
                <Icon
                  size={16}
                  aria-hidden="true"
                  className="text-[var(--sniptale-color-text-secondary)]"
                />
                {group.label}
              </h3>
              <InspectorGroupSection meta={group.meta}>{group.content}</InspectorGroupSection>
            </section>
          );
        })}
      </div>
    );
  return (
    <div ref={surface} className="-mx-3" data-ui="video-editor.inspector.sections">
      <CategorizedInspector
        key={memory.family}
        onSectionChange={memory.remember}
        ariaLabel={translate('videoEditor.sidebar.projectInspector')}
        initialSection={defaultId}
        {...(request ? { activeSectionRequest: request } : {})}
        showSectionHeading
        sections={groups.map((group) => ({
          id: group.id,
          label: group.label,
          icon: SECTION_ICONS[group.semantic],
        }))}
        renderSection={(id) => {
          const group = groups.find((candidate) => candidate.id === id);
          return group ? (
            <div key={id} data-section={id}>
              <InspectorGroupSection meta={group.meta}>{group.content}</InspectorGroupSection>
            </div>
          ) : null;
        }}
      />
    </div>
  );
}
