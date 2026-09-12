import { guideDocumentStyle } from './document-appearance';
import { Fragment, useEffect, useRef } from 'react';
import { GuideDocumentInsert } from './document-insert';
import { GuideStepActions } from './step-actions';
import type {
  GuideBlock,
  GuideSection,
  GuideStep,
  GuideProject,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import {
  createGuideParagraphs,
  resolveGuideStyle,
  type GuideStructureOperation,
} from '../../features/scenario/project/public';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import { GuideBlockActions } from './block-actions';
import { GuideImageSurface } from './image-surface';
import { GuideImageUpload } from './image-upload';

export type GuideFocusRequest = {
  sequence: number;
  blockId?: string;
  field?: boolean;
  preserveFocus?: boolean;
};

type GuideImageUploadHandler = (
  itemId: string,
  blockId: string,
  file: File,
  signal: AbortSignal
) => Promise<boolean>;

/** Semantic guide content; effects and persistence stay in the page state owner. */
export function GuideDocument({
  project,
  selectedId,
  focusRequest,
  images,
  disabled,
  onChange,
  onSelect,
  onOperate,
  onEditImage,
  onUploadImage,
  t,
}: {
  project: GuideProject;
  selectedId: string | null;
  focusRequest: GuideFocusRequest;
  images: Record<string, string | null>;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  onOperate: (operation: GuideStructureOperation) => void;
  onEditImage: (itemId: string, blockId: string) => void;
  onUploadImage: GuideImageUploadHandler;
  onSelect: (id: string) => void;
  t: Translate;
}) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(
    () => focusGuideTarget(content.current, selectedId, focusRequest),
    [selectedId, focusRequest]
  );
  let number = 0;
  return (
    <div ref={content} className="guide-document" style={guideDocumentStyle(project.style)}>
      {project.items.map((item) => {
        if (item.kind === 'section')
          return (
            <Fragment key={item.id}>
              <GuideDocumentInsert
                target={{ kind: 'item', beforeItemId: item.id }}
                disabled={disabled}
                onOperate={onOperate}
                t={t}
              />
              <section
                key={item.id}
                id={item.id}
                tabIndex={-1}
                data-selected={selectedId === item.id}
                onFocusCapture={() => {
                  if (selectedId !== item.id) onSelect(item.id);
                }}
              >
                <GuideSectionContent
                  project={project}
                  item={item}
                  disabled={disabled}
                  onChange={onChange}
                  t={t}
                />
                <GuideStepActions
                  project={project}
                  itemId={item.id}
                  disabled={disabled}
                  onOperate={onOperate}
                  t={t}
                />
              </section>
            </Fragment>
          );
        number += 1;
        const appearance = resolveGuideStyle(project.style, item.styleOverrides);
        return (
          <Fragment key={item.id}>
            <GuideDocumentInsert
              target={{ kind: 'item', beforeItemId: item.id }}
              disabled={disabled}
              onOperate={onOperate}
              t={t}
            />
            <article
              key={item.id}
              data-layout={item.layout}
              data-number-style={appearance.numberStyle}
              style={guideDocumentStyle(appearance)}
              id={item.id}
              tabIndex={-1}
              data-selected={selectedId === item.id}
              onFocusCapture={() => {
                if (selectedId !== item.id) onSelect(item.id);
              }}
            >
              <header>
                {item.showNumber && <span>{number}</span>}
                <textarea
                  className="guide-step-title"
                  rows={1}
                  aria-label={t('scenario.editor.guideStepTitle')}
                  placeholder={t('scenario.editor.guideStepTitle')}
                  maxLength={GUIDE_LIMITS.maxLabelLength}
                  value={item.title}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      {
                        ...project,
                        items: project.items.map((entry) =>
                          entry.id === item.id ? { ...item, title: event.target.value } : entry
                        ),
                      },
                      `step-title:${item.id}`
                    )
                  }
                />
              </header>
              <GuideStepBody
                project={project}
                item={item}
                images={images}
                disabled={disabled}
                onChange={onChange}
                onOperate={onOperate}
                onEditImage={onEditImage}
                onUploadImage={onUploadImage}
                t={t}
              />
              <GuideStepActions
                project={project}
                itemId={item.id}
                disabled={disabled}
                onOperate={onOperate}
                t={t}
              />
            </article>
          </Fragment>
        );
      })}
      {project.items.length > 0 && (
        <GuideDocumentInsert
          target={{ kind: 'item' }}
          end
          disabled={disabled}
          onOperate={onOperate}
          t={t}
        />
      )}
    </div>
  );
}

/** Resolves explicit document navigation after rendering; focus-driven selection leaves DOM focus alone. */
function focusGuideTarget(
  content: HTMLDivElement | null,
  selectedId: string | null,
  focusRequest: GuideFocusRequest
) {
  if (!selectedId || focusRequest.preserveFocus) return;
  const target = [...(content?.children ?? [])].find((item) => item.id === selectedId);
  if (!(target instanceof HTMLElement)) return;
  const block = focusRequest.blockId
    ? [...target.querySelectorAll<HTMLElement>('[data-block-id]')].find(
        (entry) => entry.dataset['blockId'] === focusRequest.blockId
      )
    : null;
  const field = (block ?? (focusRequest.field ? target : null))?.querySelector<HTMLElement>(
    'textarea, [data-image-upload]'
  );
  if (!field && target.contains(document.activeElement)) return;
  (field ?? target).focus({ preventScroll: true });
  (field ?? target).scrollIntoView?.({ block: field ? 'nearest' : 'start' });
}

/** Section prose has its own fields and edit groups, sharing the canonical document update. */
function GuideSectionContent({
  project,
  item,
  disabled,
  onChange,
  t,
}: {
  project: GuideProject;
  item: GuideSection;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  t: Translate;
}) {
  return (
    <>
      <h2 aria-label={item.title || t('scenario.editor.guideSectionTitle')}>
        <textarea
          className="guide-section-title"
          rows={1}
          aria-label={t('scenario.editor.guideSectionTitle')}
          placeholder={t('scenario.editor.guideSectionTitle')}
          maxLength={GUIDE_LIMITS.maxLabelLength}
          value={item.title}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              {
                ...project,
                items: project.items.map((entry) =>
                  entry.id === item.id ? { ...item, title: event.target.value } : entry
                ),
              },
              `section-title:${item.id}`
            )
          }
        />
      </h2>
      <textarea
        className="guide-description"
        rows={1}
        aria-label={t('scenario.editor.body')}
        placeholder={t('scenario.editor.body')}
        value={item.paragraphs
          .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
          .join('\n')}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            {
              ...project,
              items: project.items.map((entry) =>
                entry.id === item.id
                  ? { ...item, paragraphs: createGuideParagraphs(event.target.value) }
                  : entry
              ),
            },
            `section-body:${item.id}`
          )
        }
      />
    </>
  );
}

function GuideStepBody({
  project,
  item,
  images,
  disabled,
  onChange,
  onOperate,
  onEditImage,
  onUploadImage,
  t,
}: {
  project: GuideProject;
  item: GuideStep;
  images: Record<string, string | null>;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  onOperate: (operation: GuideStructureOperation) => void;
  onEditImage: (itemId: string, blockId: string) => void;
  onUploadImage: GuideImageUploadHandler;
  t: Translate;
}) {
  const changeBlock = (block: GuideBlock, group: string | null = `block:${block.id}`) =>
    onChange(
      {
        ...project,
        items: project.items.map((entry) =>
          entry.id === item.id
            ? {
                ...item,
                blocks: item.blocks.map((current) => (current.id === block.id ? block : current)),
              }
            : entry
        ),
      },
      group
    );
  return (
    <>
      <div className="guide-step-blocks">
        {item.blocks.map((block, index) => (
          <div
            className="guide-block"
            key={block.id}
            data-block-id={block.id}
            data-kind={block.kind}
          >
            <GuideDocumentInsert
              target={{ kind: 'block', itemId: item.id, beforeBlockId: block.id }}
              disabled={disabled}
              onOperate={onOperate}
              t={t}
            />
            <GuideBlockActions
              itemId={item.id}
              blockId={block.id}
              index={index}
              count={item.blocks.length}
              disabled={disabled}
              onOperate={onOperate}
              t={t}
            />
            {block.kind === 'image' ? (
              <GuideImageSurface
                libraryTarget={{ stepId: item.id, blockId: block.id }}
                onEdit={() => onEditImage(item.id, block.id)}
                block={block}
                url={images[block.assetId]}
                disabled={disabled}
                onChange={changeBlock}
                t={t}
              />
            ) : block.kind === 'image-slot' ? (
              <GuideImageUpload
                target={{ stepId: item.id, blockId: block.id }}
                frame={block.frame}
                disabled={disabled}
                onUpload={(file, signal) => onUploadImage(item.id, block.id, file, signal)}
                t={t}
              />
            ) : (
              <GuideTextBlock block={block} disabled={disabled} onChange={changeBlock} t={t} />
            )}
            {index === item.blocks.length - 1 && (
              <GuideDocumentInsert
                target={{ kind: 'block', itemId: item.id }}
                end
                disabled={disabled}
                onOperate={onOperate}
                t={t}
              />
            )}
          </div>
        ))}
      </div>
      {item.blocks.length === 0 && (
        <div className="guide-empty-step">
          <GuideDocumentInsert
            target={{ kind: 'block', itemId: item.id }}
            end
            disabled={disabled}
            onOperate={onOperate}
            t={t}
          />
        </div>
      )}
    </>
  );
}

function GuideTextBlock({
  block,
  disabled,
  onChange,
  t,
}: {
  block: Extract<GuideBlock, { kind: 'heading' | 'text' | 'note' }>;
  disabled: boolean;
  onChange: (block: GuideBlock) => void;
  t: Translate;
}) {
  if (block.kind === 'heading')
    return (
      <textarea
        rows={1}
        className="guide-block-heading"
        aria-label={t('scenario.editor.guideHeading')}
        placeholder={t('scenario.editor.guideHeading')}
        maxLength={GUIDE_LIMITS.maxLabelLength}
        value={block.text}
        disabled={disabled}
        onChange={(event) => onChange({ ...block, text: event.target.value })}
      />
    );
  return (
    <textarea
      aria-label={t(
        block.kind === 'note' ? 'scenario.editor.guideNoteText' : 'scenario.editor.body'
      )}
      disabled={disabled}
      className={block.kind === 'note' ? 'guide-note' : 'guide-description'}
      placeholder={t('scenario.editor.body')}
      rows={1}
      value={block.paragraphs
        .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
        .join('\n')}
      onChange={(event) =>
        onChange({ ...block, paragraphs: createGuideParagraphs(event.target.value) })
      }
    />
  );
}
