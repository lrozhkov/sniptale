import { GuideBlockRows } from './block-rows';
import { GuideVoiceField } from './voice-field';
import { GuideBlockReorder, GuideBlockReorderHandle } from './block-reorder';
import { GuideBlockLayout } from './block-layout';
import { guideDocumentStyle, guideTextAppearance } from './document-appearance';
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
  resolveGuideNumbering,
  type GuideStructureOperation,
} from '../../features/scenario/project/public';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import { GuideBlockActions } from './block-actions';
import { GuideImageSurface } from './image-surface';
import { GuideImageUpload } from './image-upload';
import { GuideNoteBlock } from './note-block';

export type GuideFocusRequest = {
  sequence: number;
  blockId?: string;
  field?: boolean;
  preserveFocus?: boolean;
};

type GuideImageUploadHandler = (
  itemId: string,
  blockId: string | null,
  file: File,
  signal: AbortSignal
) => Promise<boolean>;

type GuideDocumentProps = {
  project: GuideProject;
  selectedId: string | null;
  focusRequest: GuideFocusRequest;
  images: Record<string, string | null>;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  onOperate: (operation: GuideStructureOperation) => void;
  onEditImage: (itemId: string, blockId: string) => void;
  onUploadImage: GuideImageUploadHandler;
  framedImageId: string | null;
  onFrameImage: (itemId: string, blockId: string, editing: boolean) => void;
  onSelect: (id: string) => void;
  onSelectBlock: (itemId: string, blockId: string | null) => void;
  t: Translate;
};

/** Semantic guide content; effects and persistence stay in the page state owner. */
export function GuideDocument({
  project,
  selectedId,
  focusRequest,
  images,
  disabled,
  onChange,
  onSelect,
  onSelectBlock,
  onOperate,
  onEditImage,
  onUploadImage,
  framedImageId,
  onFrameImage,
  t,
}: GuideDocumentProps) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(
    () => focusGuideTarget(content.current, selectedId, focusRequest),
    [selectedId, focusRequest]
  );
  const numbers = resolveGuideNumbering(project.items);
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
                onFocusCapture={() => onSelectBlock(item.id, null)}
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
        const number = numbers.get(item.id)?.label;
        const appearance = resolveGuideStyle(project.style, item.styleOverrides);
        return (
          <Fragment key={item.id}>
            {project.purpose !== 'step-template' && (
              <GuideDocumentInsert
                target={{ kind: 'item', beforeItemId: item.id }}
                disabled={disabled}
                onOperate={onOperate}
                t={t}
              />
            )}
            <article
              key={item.id}
              data-layout={item.layout}
              data-number-style={appearance.numberStyle}
              style={guideDocumentStyle(appearance)}
              id={item.id}
              tabIndex={-1}
              data-selected={selectedId === item.id}
              onFocusCapture={(event) => {
                if (selectedId !== item.id) onSelect(item.id);
                const field = event.target;
                if (!(field instanceof HTMLTextAreaElement)) return;
                const block = field.closest<HTMLElement>('[data-block-id]');
                if (!block) onSelectBlock(item.id, null);
                else if (block.dataset['kind'] !== 'image')
                  onSelectBlock(item.id, block.dataset['blockId'] ?? null);
              }}
            >
              <header>
                {number != null && <span>{number}</span>}
                <GuideVoiceField
                  className="guide-step-title"
                  rows={1}
                  aria-label={t('scenario.editor.guideStepTitle')}
                  placeholder={t('scenario.editor.guideStepTitle')}
                  maxLength={GUIDE_LIMITS.maxLabelLength}
                  value={item.title}
                  disabled={disabled}
                  onValueChange={(value) =>
                    onChange(
                      {
                        ...project,
                        items: project.items.map((entry) =>
                          entry.id === item.id ? { ...item, title: value } : entry
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
                framedImageId={framedImageId}
                onFrameImage={onFrameImage}
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
      {project.items.length > 0 && project.purpose !== 'step-template' && (
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
        <GuideVoiceField
          className="guide-section-title"
          rows={1}
          aria-label={t('scenario.editor.guideSectionTitle')}
          placeholder={t('scenario.editor.guideSectionTitle')}
          maxLength={GUIDE_LIMITS.maxLabelLength}
          value={item.title}
          disabled={disabled}
          onValueChange={(value) =>
            onChange(
              {
                ...project,
                items: project.items.map((entry) =>
                  entry.id === item.id ? { ...item, title: value } : entry
                ),
              },
              `section-title:${item.id}`
            )
          }
        />
      </h2>
      <GuideVoiceField
        className="guide-description"
        rows={1}
        aria-label={t('scenario.editor.body')}
        placeholder={t('scenario.editor.body')}
        value={item.paragraphs
          .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
          .join('\n')}
        disabled={disabled}
        onValueChange={(value) =>
          onChange(
            {
              ...project,
              items: project.items.map((entry) =>
                entry.id === item.id ? { ...item, paragraphs: createGuideParagraphs(value) } : entry
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
  framedImageId,
  onFrameImage,
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
  framedImageId: string | null;
  onFrameImage: (itemId: string, blockId: string, editing: boolean) => void;
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
      <GuideBlockReorder
        projectId={project.id}
        item={item}
        disabled={disabled}
        onOperate={onOperate}
      >
        <GuideBlockRows blocks={item.blocks}>
          {(block, index) => (
            <GuideBlockLayout
              key={block.id}
              block={block}
              layout={item.layout}
              disabled={disabled}
              onHeight={
                block.kind === 'text' || block.kind === 'heading' || block.kind === 'note'
                  ? (minHeight) => changeBlock({ ...block, minHeight }, null)
                  : undefined
              }
              onWidth={(width) =>
                onOperate({ kind: 'set-block-width', itemId: item.id, blockId: block.id, width })
              }
              t={t}
            >
              <GuideDocumentInsert
                target={{ kind: 'block', itemId: item.id, beforeBlockId: block.id }}
                rowStart={block.rowStart ?? false}
                disabled={disabled}
                onOperate={onOperate}
                t={t}
              />
              <GuideBlockReorderHandle blockId={block.id} t={t} />
              <GuideBlockActions
                allowSplit={project.purpose !== 'step-template'}
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
                  editing={framedImageId === block.id}
                  onEditingChange={(editing) => onFrameImage(item.id, block.id, editing)}
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
                  placement={{ kind: 'replace-image', stepId: item.id, blockId: block.id }}
                  frame={block.frame}
                  disabled={disabled}
                  onUpload={(file, signal) => onUploadImage(item.id, block.id, file, signal)}
                  t={t}
                />
              ) : block.kind === 'note' ? (
                <GuideNoteBlock block={block} disabled={disabled} onChange={changeBlock} t={t} />
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
            </GuideBlockLayout>
          )}
        </GuideBlockRows>
      </GuideBlockReorder>
      {item.blocks.length === 0 && (
        <div className="guide-empty-step">
          <GuideImageUpload
            placement={{ kind: 'blocks', stepId: item.id }}
            disabled={disabled}
            onUpload={(file, signal) => onUploadImage(item.id, null, file, signal)}
            t={t}
          />
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
  block: Extract<GuideBlock, { kind: 'heading' | 'text' }>;
  disabled: boolean;
  onChange: (block: GuideBlock) => void;
  t: Translate;
}) {
  if (block.kind === 'heading')
    return (
      <GuideVoiceField
        rows={1}
        className="guide-block-heading"
        style={guideTextAppearance(block)}
        aria-label={t('scenario.editor.guideHeading')}
        placeholder={t('scenario.editor.guideHeading')}
        maxLength={GUIDE_LIMITS.maxLabelLength}
        value={block.text}
        disabled={disabled}
        onValueChange={(value) => onChange({ ...block, text: value })}
      />
    );
  return (
    <GuideVoiceField
      aria-label={t('scenario.editor.body')}
      disabled={disabled}
      className="guide-description"
      style={guideTextAppearance(block)}
      placeholder={t('scenario.editor.body')}
      rows={1}
      value={block.paragraphs
        .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
        .join('\n')}
      onValueChange={(value) => onChange({ ...block, paragraphs: createGuideParagraphs(value) })}
    />
  );
}
