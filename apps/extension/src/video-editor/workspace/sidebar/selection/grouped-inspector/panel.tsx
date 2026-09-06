import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Clock3,
  Info,
  Layers3,
  Move,
  MousePointer2,
  Paintbrush,
  Scan,
  Settings2,
  Sparkles,
  Video,
  ZoomIn,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { translate } from '../../../../../platform/i18n';
import { InspectorGroupSection } from './section';
import { useInspectorGroupFocusIntent } from './focus';
import { resolveVisibleInspectorGroups } from './visibility';
import type { InspectorGroupDefinition } from './types';

const SECTION_ICONS: Readonly<Record<string, LucideIcon>> = {
  info: Info,
  timing: Clock3,
  transform: Move,
  audio: AudioLines,
  canvas: Scan,
  background: Paintbrush,
  style: Paintbrush,
  appearance: Paintbrush,
  camera: Video,
  zoom: ZoomIn,
  motion: ZoomIn,
  path: Move,
  placement: Move,
  'object-tracks': Layers3,
  'effect-v1': Sparkles,
  'transition-stack': Layers3,
  samples: MousePointer2,
  correction: Scan,
};

export function InspectorGroupedPanel<TId extends string>(props: {
  groups: readonly InspectorGroupDefinition<TId>[];
}) {
  const groups = resolveVisibleInspectorGroups(props.groups);
  const defaultId =
    groups.find((group) => group.defaultActive && group.id !== 'info')?.id ??
    groups.find((group) => group.id !== 'info')?.id ??
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
    button?.focus();
  }, [focusIntent, requestedGroup]);

  if (!defaultId) return null;
  return (
    <div ref={surface} className="-mx-3" data-ui="video-editor.inspector.sections">
      <CategorizedInspector
        ariaLabel={translate('videoEditor.sidebar.projectInspector')}
        initialSection={defaultId}
        {...(request ? { activeSectionRequest: request } : {})}
        showSectionHeading
        sections={groups.map((group) => ({
          id: group.id,
          label: group.label,
          icon: SECTION_ICONS[group.id] ?? Settings2,
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
