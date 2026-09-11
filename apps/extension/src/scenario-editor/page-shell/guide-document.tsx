import { useEffect, useRef } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { createGuideParagraphs } from '../../features/scenario/project/public';

/** Semantic guide content; effects and persistence stay in the page state owner. */
export function GuideDocument({
  project,
  selectedId,
  images,
  disabled,
  onChange,
  t,
}: {
  project: GuideProject;
  selectedId: string | null;
  images: Record<string, string | null>;
  disabled: boolean;
  onChange: (project: GuideProject) => void;
  t: Translate;
}) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    const target = [...(content.current?.children ?? [])].find((item) => item.id === selectedId);
    if (!(target instanceof HTMLElement)) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'start' });
  }, [selectedId]);
  let number = 0;
  return (
    <div ref={content}>
      {project.items.map((item) => {
        if (item.kind === 'section')
          return (
            <section key={item.id} id={item.id} tabIndex={-1}>
              <h2>{item.title}</h2>
              {item.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph.runs.map((run) => run.text).join('')}</p>
              ))}
            </section>
          );
        number += 1;
        return (
          <article key={item.id} id={item.id} tabIndex={-1}>
            <header>
              {item.showNumber && <span>{number}</span>}
              <input
                aria-label={t('scenario.editor.guideStepTitle')}
                value={item.title}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...project,
                    items: project.items.map((entry) =>
                      entry.id === item.id ? { ...item, title: event.target.value } : entry
                    ),
                  })
                }
              />
            </header>
            {item.blocks.map((block) => {
              if (block.kind === 'image')
                return (
                  <figure key={block.id}>
                    <div
                      style={{
                        position: 'relative',
                        overflow: 'hidden',
                        width: '100%',
                        aspectRatio: `${block.frame.width} / ${block.frame.height}`,
                      }}
                    >
                      {images[block.assetId] ? (
                        <img
                          src={images[block.assetId] ?? undefined}
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
              if (block.kind === 'heading') return <h3 key={block.id}>{block.text}</h3>;
              return (
                <textarea
                  key={block.id}
                  aria-label={t('scenario.editor.body')}
                  disabled={disabled}
                  value={block.paragraphs
                    .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
                    .join('\n')}
                  onChange={(event) =>
                    onChange({
                      ...project,
                      items: project.items.map((entry) =>
                        entry.id !== item.id
                          ? entry
                          : {
                              ...item,
                              blocks: item.blocks.map((entryBlock) =>
                                entryBlock.id !== block.id
                                  ? entryBlock
                                  : {
                                      ...block,
                                      paragraphs: createGuideParagraphs(event.target.value),
                                    }
                              ),
                            }
                      ),
                    })
                  }
                />
              );
            })}
          </article>
        );
      })}
    </div>
  );
}
