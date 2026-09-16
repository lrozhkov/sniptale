import type {
  GuideImageBlock,
  GuideParagraph,
  GuideProject,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { resolveGuideNumbering } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { guideNoteTypes } from './note-block';

function text(value: string): string {
  return value.replace(/([\\`*_{}\[\]()<>#+.!|&~-])/g, '\\$1').replace(/\r?\n/g, '  \n');
}

function paragraphs(value: GuideParagraph[]): string {
  return value
    .map((paragraph) =>
      paragraph.runs
        .map((run) => {
          let content = text(run.text);
          if (!content) return '';
          // Fixed inline tags preserve adjacent styled runs and their boundary whitespace.
          if (run.bold) content = `<strong>${content}</strong>`;
          if (run.italic) content = `<em>${content}</em>`;
          if (run.href) {
            const href = new URL(run.href).href
              .replace(/[<>"\\]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)
              .replace(/&/g, '&amp;');
            content = `[${content}](<${href}>)`;
          }
          return content;
        })
        .join('')
    )
    .join('\n\n');
}

/** Projects canonical content into linear Markdown and an ordered raster worklist. */
export function buildGuideMarkdown(project: GuideProject, t: Translate) {
  const parts = [`# ${text(project.name)}`];
  const images: Array<{ path: string; block: GuideImageBlock }> = [];
  const numbers = resolveGuideNumbering(project.items);
  for (const item of project.items) {
    if (item.kind === 'section') {
      if (item.title) parts.push(`## ${text(item.title)}`);
      parts.push(paragraphs(item.paragraphs));
      continue;
    }
    const number = numbers.get(item.id)?.label;
    const title = [number, item.title].filter((value) => value != null && value !== '').join(' · ');
    if (title) parts.push(`## ${text(title)}`);
    for (const block of item.blocks) {
      if (block.kind === 'image-slot') continue;
      if (block.kind === 'image') {
        const path = `images/${String(images.length + 1).padStart(4, '0')}.png`;
        images.push({ path, block });
        parts.push(`![${text(block.alt)}](${path})`);
        if (block.caption) parts.push(`*${text(block.caption)}*`);
      } else if (block.kind === 'heading') {
        if (block.text) parts.push(`### ${text(block.text)}`);
      } else if (block.kind === 'note') {
        const body = paragraphs(block.paragraphs);
        if (!body) continue;
        const type = guideNoteTypes.find((type) => type.tone === block.tone)!;
        parts.push(
          `**${text(t(type.key))}**\n\n${body}`
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')
        );
      } else parts.push(paragraphs(block.paragraphs));
    }
  }
  return { markdown: parts.filter(Boolean).join('\n\n') + '\n', images };
}
