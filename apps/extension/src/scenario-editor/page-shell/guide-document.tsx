import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useEffect, useRef } from 'react';
import type {
  GuideBlock,
  GuideStep,
  GuideImageBlock,
  GuideProject,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import {
  createGuideParagraphs,
  type GuideStructureOperation,
} from '../../features/scenario/project/public';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import { GuideBlockActions } from './block-actions';
import { GuideImageSurface } from './image-surface';

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
  t,
}: {
  project: GuideProject;
  selectedId: string | null;
  focusRequest: number;
  images: Record<string, string | null>;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  onOperate: (operation: GuideStructureOperation) => void;
  onEditImage: (itemId: string, blockId: string) => void;
  onSelect: (id: string) => void;
  t: Translate;
}) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    const target = [...(content.current?.children ?? [])].find((item) => item.id === selectedId);
    if (!(target instanceof HTMLElement)) return;
    if (target.contains(document.activeElement)) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'start' });
  }, [selectedId, focusRequest]);
  let number = 0;
  return (
    <div ref={content} className="guide-document">
      {project.items.map((item) => {
        if (item.kind === 'section')
          return (
            <section
              key={item.id}
              id={item.id}
              tabIndex={-1}
              data-selected={selectedId === item.id}
              onFocusCapture={() => {
                if (selectedId !== item.id) onSelect(item.id);
              }}
            >
              <h2>{item.title}</h2>
              {item.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph.runs.map((run) => run.text).join('')}</p>
              ))}
            </section>
          );
        number += 1;
        return (
          <article
            key={item.id}
            id={item.id}
            tabIndex={-1}
            data-selected={selectedId === item.id}
            onFocusCapture={() => {
              if (selectedId !== item.id) onSelect(item.id);
            }}
          >
            <header>
              {item.showNumber && <span>{number}</span>}
              <input
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
              t={t}
            />
          </article>
        );
      })}
    </div>
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
  t,
}: {
  project: GuideProject;
  item: GuideStep;
  images: Record<string, string | null>;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  onOperate: (operation: GuideStructureOperation) => void;
  onEditImage: (itemId: string, blockId: string) => void;
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
      {item.blocks.map((block, index) => (
        <div className="guide-block" key={block.id} data-block-id={block.id}>
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
              onEdit={() => onEditImage(item.id, block.id)}
              block={block}
              url={images[block.assetId]}
              disabled={disabled}
              onChange={changeBlock}
              t={t}
            />
          ) : (
            <GuideTextBlock block={block} disabled={disabled} onChange={changeBlock} t={t} />
          )}
        </div>
      ))}
      <div
        className="guide-add-blocks"
        role="group"
        aria-label={t('scenario.editor.guideAddBlock')}
      >
        <ProductActionButton
          tone="secondary"
          compact
          type="button"
          disabled={disabled}
          onClick={() => onOperate({ kind: 'add-block', itemId: item.id, blockKind: 'text' })}
        >
          {t('scenario.editor.guideAddText')}
        </ProductActionButton>
        <ProductActionButton
          tone="secondary"
          compact
          type="button"
          disabled={disabled}
          onClick={() => onOperate({ kind: 'add-block', itemId: item.id, blockKind: 'heading' })}
        >
          {t('scenario.editor.guideAddHeading')}
        </ProductActionButton>
        <ProductActionButton
          tone="secondary"
          compact
          type="button"
          disabled={disabled}
          onClick={() => onOperate({ kind: 'add-block', itemId: item.id, blockKind: 'note' })}
        >
          {t('scenario.editor.guideAddNote')}
        </ProductActionButton>
      </div>
    </>
  );
}

function GuideTextBlock({
  block,
  disabled,
  onChange,
  t,
}: {
  block: Exclude<GuideBlock, GuideImageBlock>;
  disabled: boolean;
  onChange: (block: GuideBlock) => void;
  t: Translate;
}) {
  if (block.kind === 'heading')
    return (
      <input
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
      rows={Math.max(3, block.paragraphs.length + 1)}
      value={block.paragraphs
        .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
        .join('\n')}
      onChange={(event) =>
        onChange({ ...block, paragraphs: createGuideParagraphs(event.target.value) })
      }
    />
  );
}
