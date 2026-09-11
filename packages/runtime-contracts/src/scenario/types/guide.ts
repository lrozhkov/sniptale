import type {
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from './geometry';

/** Resource ceilings for a guide document, excluding separately stored image bytes. */
export const GUIDE_LIMITS = {
  maxItems: 300,
  maxBlocksPerStep: 200,
  maxParagraphs: 200,
  maxRunsPerParagraph: 200,
  maxIdLength: 160,
  maxLabelLength: 160,
  maxTextLength: 20_000,
  maxTags: 30,
  maxDimension: 7_680,
  maxCoordinate: 100_000,
  maxInputDepth: 16,
  maxInputVisits: 100_000,
  maxInputTextLength: 4_000_000,
} as const;

/** Inline formatting is data; renderers must emit text and validated links, never raw HTML. */
export interface GuideTextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  href: string | null;
}

/** Paragraph boundaries survive reflow, printing and Markdown projection. */
export interface GuideParagraph {
  runs: GuideTextRun[];
}

/** Document appearance is independent of the extension theme and output page size. */
export interface GuideStyle {
  theme: 'paper' | 'warm' | 'graphite';
  font: 'sans' | 'serif';
  density: 'compact' | 'comfortable' | 'spacious';
  contentWidth: 'narrow' | 'standard' | 'wide';
  imageBorder: 'none' | 'subtle' | 'strong';
  numberStyle: 'plain' | 'badge';
  accentColor: string | null;
}

/** Absent keys inherit the project style; the receiving parser rejects explicit undefined. */
export type GuideStyleOverrides = { [Key in keyof GuideStyle]?: GuideStyle[Key] | undefined };

/** A captured image retains its source context independently of other images in the step. */
export interface GuideCaptureSource {
  kind: 'capture';
  captureSurface: 'visible' | 'full' | 'selection';
  sourceKind: 'manual' | 'auto-click';
  page: ScenarioPageDescriptor;
  target: ScenarioTargetDescriptor | null;
  interactionPoint: ScenarioPoint | null;
  cursorPoint: ScenarioPoint | null;
  captureMetadata: ScenarioCaptureMetadata;
}

/** Source references are provenance; rendering uses the image block's durable assetId. */
export type GuideImageSource =
  | GuideCaptureSource
  | { kind: 'import'; filename: string }
  | { kind: 'video-frame'; recordingId: string | null; filename: string; timeSeconds: number };

/** Each accepted annotation edit uses a new editDocumentId so history never overwrites it. */
export interface GuideImageBlock {
  kind: 'image';
  id: string;
  assetId: string;
  galleryAssetId: string | null;
  editDocumentId: string | null;
  alt: string;
  caption: string;
  source: GuideImageSource;
  frame: { width: number; height: number };
  fit: 'contain' | 'cover';
  /** x/y are fractions of frame width/height; scale multiplies the fitted image size. */
  contentTransform: { x: number; y: number; scale: number };
}

/** Blocks are ordered content, not freely positioned slide elements. */
export type GuideBlock =
  | { kind: 'heading'; id: string; text: string }
  | { kind: 'text'; id: string; paragraphs: GuideParagraph[] }
  | {
      kind: 'note';
      id: string;
      tone: 'neutral' | 'info' | 'warning' | 'error';
      paragraphs: GuideParagraph[];
    }
  | GuideImageBlock;

/** Numbering derives from document order, even when a step hides its number. */
export interface GuideStep {
  kind: 'step';
  id: string;
  title: string;
  showNumber: boolean;
  layout: 'stacked' | 'side-by-side' | 'comparison' | 'text';
  templateId: string | null;
  styleOverrides: GuideStyleOverrides;
  blocks: GuideBlock[];
}

/** A section introduces subsequent steps until the next section; it has no step number. */
export interface GuideSection {
  kind: 'section';
  id: string;
  title: string;
  paragraphs: GuideParagraph[];
}

/** The only guide content format; persistence owns lifecycle, revision and retained history. */
export interface GuideProject {
  version: 4;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  style: GuideStyle;
  print: {
    pageSize: 'a4' | 'letter';
    orientation: 'portrait' | 'landscape';
    pagination: 'flow' | 'step';
  };
  items: Array<GuideSection | GuideStep>;
}

/** Portable appearance only; templates never contain guide content or resource identities. */
export interface GuideAppearanceTemplate {
  format: 'sniptale-guide-template';
  version: 1;
  name: string;
  layout: GuideStep['layout'];
  showNumber: boolean;
  style: GuideStyle;
}

export const MAX_GUIDE_TEMPLATE_BYTES = 16 * 1024;
