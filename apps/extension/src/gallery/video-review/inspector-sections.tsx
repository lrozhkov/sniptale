import { createPortal } from 'react-dom';
import { ReviewSelectionCommandSlotsContext } from './selection-command-slots';
import {
  ReviewSelectionActionsContext,
  ReviewTimelineMultiSelectionContext,
} from './selection-actions';
import { InspectorDisclosurePreferences } from '../../composition/inspector-disclosures/state';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { EllipsisVertical, Layers2, Info, type LucideIcon } from 'lucide-react';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { translate } from '../../platform/i18n';
import { ReviewDetails } from './controls';

const PresentationContext = createContext<{
  value: 'all' | 'sections';
  remembered?: string | undefined;
  remember?: ((id: string) => void) | undefined;
}>({ value: 'all' });

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
  children: ReactNode;
}) {
  const family =
    props.section === 'selected'
      ? (props.selectionScope ?? 'selection')
      : (props.section ?? 'selection');
  const [choices, setChoices] = useState<Readonly<Record<string, string>>>({});
  const remembered = choices[family];
  const remember = useCallback(
    (id: string) => setChoices((current) => ({ ...current, [family]: id })),
    [family]
  );
  const context = useMemo(
    () => ({ value: props.value, remembered, remember }),
    [props.value, remembered, remember]
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

/** One section definition drives both the vertical navigation and the collapsible list. */
export function ReviewInspectorSections({
  sections: suppliedSections,
  leadingSectionColumn = false,
}: {
  sections: readonly ReviewInspectorSection[];
  /** Isolate a large leading group in All mode without changing category order. */
  leadingSectionColumn?: boolean;
}) {
  const actionTarget = useContext(ReviewSelectionActionsContext);
  const selectionCount = useContext(ReviewTimelineMultiSelectionContext)?.keys.length ?? 0;
  const actions = actionTarget?.commandHost
    ? suppliedSections.find((section) => section.id === 'actions')
    : undefined;
  const sections = suppliedSections;
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
  const presentation = context.value;
  const [local, setLocal] = useState<string>();
  const remembered = context.remembered ?? local;
  const remember = context.remember ?? setLocal;
  const initial = sections.find((section) => section.id === remembered)?.id ?? sections[0]?.id;
  // Terminal commands follow the parameters without taking a parameter column of their own.
  const parameterCount = sections.length - Number(sections.at(-1)?.id === 'actions');
  const columnBreak =
    parameterCount <= 1
      ? sections.length
      : leadingSectionColumn
        ? 1
        : Math.ceil(parameterCount / 2);
  if (!initial) return actionPanel;
  return (
    <>
      {actionPanel}
      <div data-ui="gallery.videoReview.inspectorSections" data-presentation={presentation}>
        {presentation === 'sections' && sections.length > 1 ? (
          <CategorizedInspector
            dataUi="gallery.videoReview.inspectorCategories"
            ariaLabel={translate('scenario.editor.inspectorShowSections')}
            initialSection={initial}
            sections={sections}
            onSectionChange={remember}
            showSectionHeading
            renderSection={(id) => (
              <div key={id} className="review-inspector-section-body" data-section={id}>
                {sections.find((section) => section.id === id)?.content}
              </div>
            )}
          />
        ) : (
          [sections.slice(0, columnBreak), sections.slice(columnBreak)]
            .filter((column) => column.length > 0)
            .map((column, index) => (
              <div className="review-inspector-section-column" key={index}>
                {column.map(({ id, label, icon, disclosureIcon, content }) => (
                  <section key={id} data-section={id} className="review-inspector-section">
                    <ReviewDetails
                      preferenceId={`section:${id}`}
                      label={label}
                      {...(disclosureIcon === null ? {} : { icon: disclosureIcon ?? icon })}
                      level="section"
                      initiallyOpen
                    >
                      {content}
                    </ReviewDetails>
                  </section>
                ))}
              </div>
            ))
        )}
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
