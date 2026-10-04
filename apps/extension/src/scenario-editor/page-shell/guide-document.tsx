import { useGuideInsertPlacement } from './document-insert-placement';
import { GuideBlockRows } from './block-rows';
import { GuideVoiceField } from './voice-field';
import { GuideBlockReorder, GuideBlockReorderHandle } from './block-reorder';
import { GuideBlockLayout } from './block-layout';
import { guideDocumentStyle, guideTextAppearance } from './document-appearance';
import { guideDocumentSelection, useGuideSelectionInput } from './document-selection';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { GuideDocumentInsert, GuideInsertScope } from './document-insert';
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
import { useGuideLayoutAssistance } from './layout-assistance';

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
  selectedBlockId?: string | null;
  onClearSelection?: () => void;
  focusRequest: GuideFocusRequest;
  images: Record<string, string | null>;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  onOperate: (operation: GuideStructureOperation) => void;
  onEditImage: (itemId: string, blockId: string) => void;
  onUploadImage: GuideImageUploadHandler;
  framedImageId: string | null;
  onFrameImage: (itemId: string, blockId: string, editing: boolean) => void;
  onSelectBlock: (itemId: string, blockId: string | null) => void;
  t: Translate;
};

/** Semantic guide content; effects and persistence stay in the page state owner. */
export function GuideDocument({
  project,
  selectedId,
  selectedBlockId = null,
  onClearSelection,
  focusRequest,
  images,
  disabled,
  onChange,
  onSelectBlock,
  onOperate,
  onEditImage,
  onUploadImage,
  framedImageId,
  onFrameImage,
  t,
}: GuideDocumentProps) {
  const { showBoundaries } = useGuideLayoutAssistance();
  const content = useRef<HTMLDivElement>(null);
  const instructions = useId();
  const [textEditing, setTextEditing] = useState(false);
  useGuideSelectionInput(content);
  const breaks = useGuideInsertPlacement(content);
  const selection = guideDocumentSelection({
    selectedId,
    selectedBlockId,
    select: onSelectBlock,
    clear: () => onClearSelection?.(),
    onTextEditing: setTextEditing,
  });
  useEffect(
    () => focusGuideTarget(content.current, selectedId, focusRequest),
    [selectedId, focusRequest]
  );
  const numbers = resolveGuideNumbering(project.items);
  return (
    <GuideInsertScope breaks={breaks} value={!!(selectedBlockId || textEditing || framedImageId)}>
      <div
        ref={content}
        className="guide-document"
        data-show-boundaries={showBoundaries || undefined}
        tabIndex={-1}
        style={guideDocumentStyle(project.style)}
        {...selection}
      >
        <span id={instructions} className="sr-only">
          {t('scenario.editor.guideSelectionHelp')}
        </span>
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
                <GuideSectionContent
                  project={project}
                  item={item}
                  selected={selectedId === item.id}
                  instructions={instructions}
                  disabled={disabled}
                  onChange={onChange}
                  onOperate={onOperate}
                  t={t}
                />
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
                tabIndex={0}
                role="group"
                aria-label={item.title || t('scenario.editor.guideStepTitle')}
                aria-describedby={instructions}
                aria-current={selectedId === item.id && !selectedBlockId ? true : undefined}
                data-selected={selectedId === item.id && !selectedBlockId}
              >
                <GuideStepHeader
                  project={project}
                  item={item}
                  number={number}
                  disabled={disabled}
                  onChange={onChange}
                  t={t}
                />
                <GuideStepBody
                  project={project}
                  item={item}
                  images={images}
                  disabled={disabled}
                  onChange={onChange}
                  onOperate={onOperate}
                  onEditImage={onEditImage}
                  onUploadImage={onUploadImage}
                  selectedBlockId={selectedId === item.id ? selectedBlockId : null}
                  instructions={instructions}
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
    </GuideInsertScope>
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
  onOperate,
  selected,
  instructions,
  t,
}: {
  project: GuideProject;
  item: GuideSection;
  selected: boolean;
  instructions: string;
  onOperate: (operation: GuideStructureOperation) => void;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  t: Translate;
}) {
  return (
    <section
      id={item.id}
      tabIndex={0}
      role="group"
      aria-label={item.title || t('scenario.editor.guideSectionTitle')}
      aria-describedby={instructions}
      aria-current={selected ? true : undefined}
      data-selected={selected}
    >
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
      <GuideStepActions
        project={project}
        itemId={item.id}
        disabled={disabled}
        onOperate={onOperate}
        t={t}
      />
    </section>
  );
}

type GuideStepBodyProps = {
  project: GuideProject;
  item: GuideStep;
  selectedBlockId: string | null;
  instructions: string;
  images: Record<string, string | null>;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  onOperate: (operation: GuideStructureOperation) => void;
  onEditImage: (itemId: string, blockId: string) => void;
  onUploadImage: GuideImageUploadHandler;
  framedImageId: string | null;
  onFrameImage: (itemId: string, blockId: string, editing: boolean) => void;
  t: Translate;
};

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
  selectedBlockId,
  instructions,
  t,
}: GuideStepBodyProps) {
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
              selected={selectedBlockId === block.id}
              describedBy={instructions}
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
                <GuideNoteBlock
                  selected={selectedBlockId === block.id}
                  block={block}
                  disabled={disabled}
                  onChange={changeBlock}
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

/** Step heading owns its editable title and displayed numbering within the document. */
function GuideStepHeader({
  project,
  item,
  number,
  disabled,
  onChange,
  t,
}: {
  project: GuideProject;
  item: GuideStep;
  number: string | null | undefined;
  disabled: boolean;
  onChange: GuideDocumentProps['onChange'];
  t: Translate;
}) {
  return (
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
  );
}
