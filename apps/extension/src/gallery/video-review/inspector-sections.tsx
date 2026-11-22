import { createPortal } from 'react-dom';
import {
  ReviewSelectionCommandSlotsContext,
  ReviewCommandMenuContext,
} from './selection-command-slots';
import {
  ReviewSelectionActionsContext,
  ReviewTimelineMultiSelectionContext,
} from './selection-actions';
import { InspectorDisclosurePreferences } from '../../composition/inspector-disclosures/state';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import { EllipsisVertical, Layers2, Info, type LucideIcon } from 'lucide-react';
import { ReviewInspectorSectionNavigation } from './inspector-section-navigation';
import { ReviewDetails } from './controls';
import { translate } from '../../platform/i18n';

const PresentationContext = createContext<{
  value: 'all' | 'sections';
  remembered?: string | undefined;
  remember?: ((id: string) => void) | undefined;
  registerSectionCount?: ((owner: object, count: number | null) => void) | undefined;
}>({ value: 'sections' });

/** Presentation stays outside the video document; disclosure choices survive editor sessions. */
export function ReviewInspectorPresentation(props: {
  value: 'all' | 'sections';
  section?:
    | 'project'
    | 'track'
    | 'scene'
    | 'selected'
    | 'comments'
    | 'export'
    | 'history'
    | 'preview'
    | 'speech'
    | 'text';
  selectionScope?: string | undefined;
  onSectionCountChange?: ((count: number) => void) | undefined;
  children: ReactNode;
}) {
  const family =
    props.section === 'selected'
      ? (props.selectionScope ?? 'selection')
      : (props.section ?? 'selection');
  const [choices, setChoices] = useState<Readonly<Record<string, string>>>({});
  const onSectionCountChange = props.onSectionCountChange;
  const sectionCounts = useRef(new Map<object, number>());
  const registerSectionCount = useCallback(
    (owner: object, count: number | null) => {
      if (count === null) sectionCounts.current.delete(owner);
      else sectionCounts.current.set(owner, count);
      onSectionCountChange?.(Math.max(0, ...sectionCounts.current.values()));
    },
    [onSectionCountChange]
  );
  const remembered = choices[family];
  const remember = useCallback(
    (id: string) => setChoices((current) => ({ ...current, [family]: id })),
    [family]
  );
  const context = useMemo(
    () => ({
      value: props.value,
      remembered,
      remember,
      registerSectionCount,
    }),
    [props.value, remembered, remember, registerSectionCount]
  );
  return (
    <InspectorDisclosurePreferences scope={`gallery:${family}`}>
      <PresentationContext value={context}>{props.children}</PresentationContext>
    </InspectorDisclosurePreferences>
  );
}

/** One parameter group supplied to the selected-object inspector. */
export type ReviewInspectorSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Null omits a secondary disclosure icon; category navigation retains its meaningful icon. */
  disclosureIcon?: LucideIcon | null;
  content: ReactNode;
};

export const ReviewInspectorCloneContext = createContext<ReactNode>(null);

function ReviewInspectorActionContents({ children }: { children: ReactNode }) {
  const clone = useContext(ReviewInspectorCloneContext);
  return (
    <div className="review-inspector-actions">
      {clone}
      {children}
    </div>
  );
}

/** Selected-object commands share metadata and local geometry in either presentation mode. */
export function reviewInspectorActions(content: ReactNode): ReviewInspectorSection {
  return {
    id: 'actions',
    label: translate('gallery.videoReview.actionActions'),
    icon: EllipsisVertical,
    content: <ReviewInspectorActionContents>{content}</ReviewInspectorActionContents>,
  };
}

/** The inspector header owns placement for the active command menu. */
export const ReviewInspectorActionTrayContext = createContext<HTMLElement | null>(null);

/** Commands are separate from parameter categories and retain their existing owners. */
export function ReviewInspectorActionTray({ children }: { children: ReactNode }) {
  const host = useContext(ReviewInspectorActionTrayContext);
  const tray = (
    <div
      className="review-inspector-action-tray"
      data-ui="gallery.videoReview.inspectorActionTray"
      data-section="actions"
    >
      <ReviewSelectionCommandSlotsContext value={null}>
        <ReviewCommandMenuContext value={!!host}>{children}</ReviewCommandMenuContext>
      </ReviewSelectionCommandSlotsContext>
    </div>
  );
  return host ? createPortal(tray, host) : tray;
}

/** The same row navigates all item parameters; a single group needs no grouping chrome. */
export function ReviewInspectorSections({
  sections: suppliedSections,
  rememberSection = true,
}: {
  sections: readonly ReviewInspectorSection[];
  rememberSection?: boolean;
}) {
  const actionTarget = useContext(ReviewSelectionActionsContext);
  const selectionCount = useContext(ReviewTimelineMultiSelectionContext)?.keys.length ?? 0;
  const actions = suppliedSections.find((section) => section.id === 'actions');
  const sections = suppliedSections.filter((section) => section.id !== 'actions');
  const actionPanel =
    actions && actionTarget?.commandHost
      ? createPortal(
          <ReviewSelectionCommandSlotsContext value={actionTarget.commandSlots}>
            {selectionCount > 1 ? (
              <span
                className="review-selection-count"
                title={translate('gallery.videoReview.timelineSelectionCount').replace(
                  '{count}',
                  String(selectionCount)
                )}
              >
                <Layers2 size={14} aria-hidden="true" />
                <span aria-hidden="true">{selectionCount}</span>
                <span className="sr-only">
                  {translate('gallery.videoReview.timelineSelectionCount').replace(
                    '{count}',
                    String(selectionCount)
                  )}
                </span>
              </span>
            ) : null}
            {actions.content}
          </ReviewSelectionCommandSlotsContext>,
          actionTarget.commandHost
        )
      : null;
  const context = useContext(PresentationContext);
  const registerSectionCount = context.registerSectionCount;
  const sectionOwner = useRef({});
  useLayoutEffect(() => {
    const owner = sectionOwner.current;
    registerSectionCount?.(owner, sections.length);
    return () => registerSectionCount?.(owner, null);
  }, [registerSectionCount, sections.length]);
  const [local, setLocal] = useState<string>();
  const id = useId();
  const remembered = rememberSection ? (context.remembered ?? local) : local;
  const remember = (rememberSection ? context.remember : undefined) ?? setLocal;
  const current = sections.find((section) => section.id === remembered) ?? sections[0];
  return (
    <>
      {actionPanel}
      <div
        data-ui="gallery.videoReview.inspectorSections"
        data-presentation={context.value === 'all' ? 'all' : 'tabs'}
        className="flex min-w-0 max-w-full flex-col"
      >
        {context.value === 'all' && sections.length > 1 ? (
          sections.map((section) => (
            <ReviewDetails
              key={section.id}
              level="section"
              label={section.label}
              preferenceId={`group:${section.id}`}
              initiallyOpen
            >
              <div data-section={section.id}>{section.content}</div>
            </ReviewDetails>
          ))
        ) : current ? (
          <>
            <ReviewInspectorSectionNavigation
              id={id}
              value={current.id}
              items={sections}
              onChange={remember}
              label={translate('scenario.editor.inspectorShowSections')}
            />
            <div
              key={current.id}
              className="review-inspector-section-body"
              data-section={current.id}
              role="tabpanel"
              id={`${id}-${current.id}`}
              aria-label={current.label}
              aria-labelledby={sections.length > 1 ? `${id}-${current.id}-tab` : undefined}
            >
              {current.content}
            </div>
          </>
        ) : null}
        {actions ? <ReviewInspectorActionTray>{actions.content}</ReviewInspectorActionTray> : null}
      </div>
    </>
  );
}

/** Each child stays one semantic unit as available inspector space changes. */
export function ReviewInspectorColumns({ children }: { children: ReactNode }) {
  return <div className="review-inspector-columns">{children}</div>;
}

export function reviewInformationSections(content: ReactNode): ReviewInspectorSection[] {
  return content
    ? [
        {
          id: 'information',
          label: translate('gallery.videoReview.actionInformation'),
          icon: Info,
          content,
        },
      ]
    : [];
}
