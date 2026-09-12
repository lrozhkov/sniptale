import { guideItemSchemas } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type {
  GuideBlock,
  GuideProject,
  GuideParagraph,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { GuideAiChange } from '../../features/scenario/project/ai-proposal';
import type { Translate } from '../../platform/i18n';

const labels = new Map<string, Parameters<Translate>[0]>([
  ['showNumber', 'scenario.editor.guideShowNumber'],
  ['numbering', 'scenario.editor.guideNumbering'],
  ['restartAt', 'scenario.editor.guideRestartNumbering'],
  ['label', 'scenario.editor.guideCustomNumber'],
  ['layout', 'scenario.editor.appearanceLayout'],
  ['styleOverrides', 'scenario.editor.appearance'],
  ['htmlExport', 'scenario.editor.htmlImages'],
  ['content', 'scenario.editor.htmlContent'],
  ['optimize', 'scenario.editor.htmlOptimize'],
  ['maxEdge', 'scenario.editor.htmlMaxEdge'],
  ['quality', 'scenario.editor.htmlQuality'],
  ['viewer', 'scenario.editor.htmlViewer'],
  ['x', 'scenario.editor.guideAiOffsetX'],
  ['y', 'scenario.editor.guideAiOffsetY'],
  ['width', 'scenario.editor.guideBlockWidth'],
  ['textStyle', 'scenario.editor.appearance'],
  ['size', 'scenario.editor.guideTextSize'],
  ['alignment', 'scenario.editor.guideTextAlignment'],
  ['tone', 'scenario.editor.guideNoteType'],
  ['frame', 'scenario.editor.guideEditImageFrame'],
  ['height', 'scenario.editor.guideImageHeight'],
  ['fit', 'scenario.editor.guideImageFit'],
  ['contentTransform', 'scenario.editor.guideEditImageFrame'],
  ['scale', 'scenario.editor.guideImageZoom'],
  ['theme', 'scenario.editor.appearanceTheme'],
  ['font', 'scenario.editor.appearanceFont'],
  ['density', 'scenario.editor.appearanceDensity'],
  ['contentWidth', 'scenario.editor.appearanceWidth'],
  ['imageBorder', 'scenario.editor.appearanceBorder'],
  ['numberStyle', 'scenario.editor.appearanceNumber'],
  ['accentColor', 'scenario.editor.appearanceAccent'],
]);
const values = new Map<string, Parameters<Translate>[0]>([
  ['stacked', 'scenario.editor.appearanceStacked'],
  ['side-by-side', 'scenario.editor.appearanceSideBySide'],
  ['comparison', 'scenario.editor.appearanceComparison'],
  ['text', 'scenario.editor.appearanceText'],
  ['full', 'scenario.editor.guideFullWidth'],
  ['half', 'scenario.editor.guideHalfWidth'],
  ['small', 'scenario.editor.guideTextSmall'],
  ['normal', 'scenario.editor.guideTextNormal'],
  ['large', 'scenario.editor.guideTextLarge'],
  ['start', 'scenario.editor.guideTextStart'],
  ['center', 'scenario.editor.guideTextCenter'],
  ['end', 'scenario.editor.guideTextEnd'],
  ['neutral', 'scenario.editor.guideNoteNeutral'],
  ['info', 'scenario.editor.guideNoteInfo'],
  ['warning', 'scenario.editor.guideNoteWarning'],
  ['error', 'scenario.editor.guideNoteError'],
  ['contain', 'scenario.editor.guideImageContain'],
  ['cover', 'scenario.editor.guideImageCover'],
  ['paper', 'scenario.editor.appearancePaper'],
  ['warm', 'scenario.editor.appearanceWarm'],
  ['graphite', 'scenario.editor.appearanceGraphite'],
  ['sans', 'scenario.editor.appearanceSans'],
  ['serif', 'scenario.editor.appearanceSerif'],
  ['compact', 'scenario.editor.appearanceCompact'],
  ['comfortable', 'scenario.editor.appearanceComfortable'],
  ['spacious', 'scenario.editor.appearanceSpacious'],
  ['narrow', 'scenario.editor.appearanceNarrow'],
  ['standard', 'scenario.editor.appearanceStandard'],
  ['wide', 'scenario.editor.appearanceWide'],
  ['none', 'scenario.editor.appearanceNone'],
  ['subtle', 'scenario.editor.appearanceSubtle'],
  ['strong', 'scenario.editor.appearanceStrong'],
  ['plain', 'scenario.editor.appearancePlain'],
  ['badge', 'scenario.editor.appearanceBadge'],
]);

function describe(value: unknown, t: Translate, field = ''): string {
  if (value === null || value === undefined) return '—';
  if (field === 'scale' && typeof value === 'number') return `${Math.round(value * 100)}%`;
  if (field === 'content' && (value === 'full' || value === 'frame'))
    return t(value === 'full' ? 'scenario.editor.htmlFull' : 'scenario.editor.htmlFrame');
  if (typeof value === 'boolean')
    return t(value ? 'scenario.editor.guideAiEnabled' : 'scenario.editor.guideAiDisabled');
  const valueLabel = typeof value === 'string' ? values.get(value) : undefined;
  if (valueLabel) return t(valueLabel);
  if (typeof value === 'object')
    return Object.entries(value)
      .map(([key, item]) => {
        const labelKey = labels.get(key);
        const label = labelKey ? t(labelKey) : key;
        return `${label}: ${describe(item, t, key)}`;
      })
      .join('\n');
  return String(value);
}

/** Parameter previews use the same field labels as the inspector; ordinary text stays literal. */
export function GuideAiChangeValue({
  change,
  images = {},
  side,
  t,
}: {
  change: GuideAiChange;
  images?: Record<string, string | null>;
  side: 'before' | 'after';
  t: Translate;
}) {
  if (
    change.operation.type === 'replaceStructure' ||
    change.operation.type === 'replaceStep' ||
    change.operation.type === 'replaceBlock'
  ) {
    const value: unknown = JSON.parse(change[side]);
    return <GuideAiCompositionList items={readComposition(value)} images={images} t={t} />;
  }
  if (!('parameters' in change.operation)) return <>{change[side] || '—'}</>;
  const parameters: unknown = JSON.parse(change[side]);
  if (!isPlainRecord(parameters)) return <>—</>;
  const visible = Object.fromEntries(
    Object.keys(change.operation.parameters).map((key) => [key, parameters[key]])
  );
  return <>{describe(visible, t)}</>;
}

type ReviewItem = GuideProject['items'][number] | GuideBlock;

function readComposition(value: unknown): ReviewItem[] {
  const values: unknown[] = Array.isArray(value) ? value : [value];
  return values.flatMap((item): ReviewItem[] => {
    const step = guideItemSchemas.step.safeParse(item);
    if (step.success) return [step.data];
    const section = guideItemSchemas.section.safeParse(item);
    if (section.success) return [section.data];
    const block = guideItemSchemas.step.shape.blocks.element.safeParse(item);
    return block.success ? [block.data] : [];
  });
}

/** Ordered content review excludes storage identity and recorded provenance. */
function GuideAiCompositionList({
  items,
  images,
  t,
}: {
  items: ReviewItem[];
  images: Record<string, string | null>;
  t: Translate;
}) {
  return (
    <ol>
      {items.map((value) => (
        <li key={value.id} className="guide-ai-composition-value">
          {'title' in value && <strong>{value.title}</strong>}
          {value.kind === 'heading' && <strong>{value.text}</strong>}
          {(value.kind === 'image' || value.kind === 'image-slot') && (
            <span>
              {t('scenario.editor.guideImageCaption')}: {value.caption || '—'}
              <br />
              {t('scenario.editor.guideImageAlt')}: {value.alt || '—'}
              {value.kind === 'image' && images[value.assetId] && (
                <img
                  className="guide-ai-composition-image"
                  src={images[value.assetId]!}
                  alt={value.alt}
                />
              )}
            </span>
          )}
          {'paragraphs' in value && <GuideAiParagraphValue paragraphs={value.paragraphs} />}
          <small>
            {describe(
              Object.fromEntries(Object.entries(value).filter(([key]) => labels.has(key))),
              t
            )}
          </small>
          {value.kind === 'step' && (
            <GuideAiCompositionList items={value.blocks} images={images} t={t} />
          )}
        </li>
      ))}
    </ol>
  );
}

function GuideAiParagraphValue({ paragraphs }: { paragraphs: GuideParagraph[] }) {
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <span key={index}>
          {paragraph.runs.map((run, runIndex) => (
            <span
              key={runIndex}
              style={{
                fontWeight: run.bold ? 'bold' : 'normal',
                fontStyle: run.italic ? 'italic' : 'normal',
              }}
            >
              {run.text}
              {run.href && <small> ({run.href})</small>}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}
