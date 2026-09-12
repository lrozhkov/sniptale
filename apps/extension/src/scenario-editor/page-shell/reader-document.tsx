import type { ReactNode } from 'react';
import type {
  GuideBlock,
  GuideImageBlock,
  GuideParagraph,
  GuideProject,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  resolveGuideBlockWidth,
  resolveGuideNumbering,
  resolveGuideStyle,
} from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import {
  guideDocumentStyle,
  guideTextAppearance,
  guideBlockWidthStyle,
} from './document-appearance';
import { guideNoteTypes } from './note-block';

/** Semantic document rendering shared by local reading and subsequent output adapters. */
export function GuideReadDocument({
  project,
  images,
  itemId,
  renderImage,
  t,
}: {
  project: GuideProject;
  images: Record<string, string | null>;
  itemId?: string;
  renderImage?: (block: GuideImageBlock) => ReactNode;
  t: Translate;
}) {
  const numbers = resolveGuideNumbering(project.items);
  return (
    <div className="guide-document guide-read-document" style={guideDocumentStyle(project.style)}>
      {project.items
        .filter((item) => !itemId || item.id === itemId)
        .map((item) => {
          if (item.kind === 'section')
            return (
              <section id={item.id} key={item.id} tabIndex={-1}>
                {item.title && <h2>{item.title}</h2>}
                <GuideReadParagraphs paragraphs={item.paragraphs} />
              </section>
            );
          const style = resolveGuideStyle(project.style, item.styleOverrides);
          const number = numbers.get(item.id)?.label;
          const blocks = item.blocks.filter(hasReadContent);
          return (
            <article
              id={item.id}
              tabIndex={-1}
              key={item.id}
              data-layout={item.layout}
              data-number-style={style.numberStyle}
              style={guideDocumentStyle(style)}
            >
              {(number != null || item.title) && (
                <header>
                  {number != null && <span>{number}</span>}
                  {item.title && <h2>{item.title}</h2>}
                </header>
              )}
              {blocks.length > 0 && (
                <div className="guide-step-blocks">
                  {blocks.map((block) => (
                    <div
                      key={block.id}
                      className="guide-block"
                      data-block-id={block.id}
                      data-kind={block.kind}
                      data-width={resolveGuideBlockWidth(item.layout, block)}
                      style={guideBlockWidthStyle(resolveGuideBlockWidth(item.layout, block))}
                    >
                      {block.kind === 'image' && renderImage ? (
                        renderImage(block)
                      ) : (
                        <GuideReadBlock block={block} images={images} t={t} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
    </div>
  );
}

function GuideReadBlock({
  block,
  images,
  t,
}: {
  block: GuideBlock;
  images: Record<string, string | null>;
  t: Translate;
}) {
  if (block.kind === 'image-slot') return null;
  if (block.kind === 'image')
    return (
      <figure className="guide-read-image">
        <div
          className="guide-image-frame"
          style={{
            width: `min(100%, ${block.frame.width}px)`,
            aspectRatio: `${block.frame.width} / ${block.frame.height}`,
            ...{ '--guide-frame-ratio': String(block.frame.width / block.frame.height) },
          }}
        >
          {images[block.assetId] ? (
            <img
              src={images[block.assetId]!}
              alt={block.alt}
              style={{
                width: '100%',
                height: '100%',
                objectFit: block.fit,
                translate: `${block.contentTransform.x * 100}% ${block.contentTransform.y * 100}%`,
                scale: block.contentTransform.scale,
              }}
            />
          ) : (
            <p role="status">
              {t(
                images[block.assetId] === null
                  ? 'scenario.editor.workspacePreviewLoadError'
                  : 'scenario.editor.loading'
              )}
            </p>
          )}
        </div>
        {block.caption && <figcaption>{block.caption}</figcaption>}
      </figure>
    );
  if (block.kind === 'heading') return <h3 style={guideTextAppearance(block)}>{block.text}</h3>;
  if (block.kind === 'note') {
    const type = guideNoteTypes.find((type) => type.tone === block.tone)!;
    return (
      <aside
        className="guide-note-callout"
        data-tone={block.tone}
        role="note"
        aria-label={t(type.key)}
      >
        <type.icon size={18} aria-hidden="true" />
        <div style={guideTextAppearance(block)}>
          <GuideReadParagraphs paragraphs={block.paragraphs} />
        </div>
      </aside>
    );
  }
  return (
    <div style={guideTextAppearance(block)}>
      <GuideReadParagraphs paragraphs={block.paragraphs} />
    </div>
  );
}

function hasReadContent(block: GuideBlock): boolean {
  if (block.kind === 'image-slot') return false;
  if (block.kind === 'image') return true;
  if (block.kind === 'heading') return block.text.length > 0;
  return block.paragraphs.some((paragraph) => paragraph.runs.some((run) => run.text.length > 0));
}

function GuideReadParagraphs({ paragraphs }: { paragraphs: GuideParagraph[] }) {
  if (!paragraphs.some((paragraph) => paragraph.runs.some((run) => run.text.length > 0)))
    return null;
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          {!paragraph.runs.some((run) => run.text.length > 0) ? (
            <br />
          ) : (
            paragraph.runs.map((run, index) => {
              let content: ReactNode = run.text;
              if (run.bold) content = <strong>{content}</strong>;
              if (run.italic) content = <em>{content}</em>;
              return run.href ? (
                <a key={index} href={run.href} target="_blank" rel="noopener noreferrer">
                  {content}
                </a>
              ) : (
                <span key={index}>{content}</span>
              );
            })
          )}
        </p>
      ))}
    </>
  );
}
