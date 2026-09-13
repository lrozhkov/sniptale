import type { GuideImageSource } from './image-source';
export type { GuideCaptureSource, GuideVideoAction, GuideImageSource } from './image-source';
export { GUIDE_LIMITS } from '../limits';

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

/** HTML raster policy applies to an image occurrence; absence inherits document defaults. */
export interface GuideHtmlImageSettings {
  content: 'full' | 'frame';
  optimize: boolean;
  maxEdge: 1280 | 1920 | 2560 | 4096;
  quality: 0.75 | 0.85 | 0.95;
  viewer: boolean;
}

/** Named presets or an integer percentage from GUIDE_LIMITS.minBlockWidthPercent through 100. */
export type GuideBlockWidth = 'full' | 'half' | number;

/** Explicit block composition overrides the step preset; absence inherits it. */
export interface GuideBlockComposition {
  width?: GuideBlockWidth | undefined;
  /** Starts a local row; absence keeps automatic wrapping. */
  rowStart?: boolean | undefined;
}

/** Each accepted annotation edit uses a new editDocumentId so history never overwrites it. */
export interface GuideImageBlock extends GuideBlockComposition {
  kind: 'image';
  htmlExport?: GuideHtmlImageSettings | undefined;
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

/** Empty image space has layout and identity but owns no media until filled. */
export interface GuideImageSlotBlock extends Pick<
  GuideImageBlock,
  'id' | 'frame' | 'fit' | 'alt' | 'caption' | 'width' | 'rowStart'
> {
  kind: 'image-slot';
}

/** Closed prose appearance; absent metadata retains the element's default typography. */
export interface GuideTextStyle {
  size: 'small' | 'normal' | 'large';
  alignment: 'start' | 'center' | 'end';
}

/** Blocks are ordered content; prose minHeight reserves CSS pixels without clipping content. */
export type GuideBlock = GuideBlockComposition &
  (
    | {
        kind: 'heading';
        id: string;
        text: string;
        minHeight?: number | undefined;
        textStyle?: GuideTextStyle | undefined;
      }
    | {
        kind: 'text';
        minHeight?: number | undefined;
        id: string;
        paragraphs: GuideParagraph[];
        textStyle?: GuideTextStyle | undefined;
      }
    | {
        kind: 'note';
        minHeight?: number | undefined;
        textStyle?: GuideTextStyle | undefined;
        id: string;
        tone: 'neutral' | 'info' | 'warning' | 'error';
        paragraphs: GuideParagraph[];
      }
    | GuideImageBlock
    | GuideImageSlotBlock
  );

/** Explicit restart and manual label; omitted fields continue automatic numbering. */
export type GuideStepNumbering = { restartAt?: number | undefined; label?: string | undefined };

/** Hidden and manually labelled steps do not consume the automatic counter. */
export interface GuideStep {
  kind: 'step';
  id: string;
  title: string;
  showNumber: boolean;
  numbering?: GuideStepNumbering | undefined;
  layout: 'stacked' | 'side-by-side' | 'comparison' | 'text';
  templateId: string | null;
  styleOverrides: GuideStyleOverrides;
  blocks: GuideBlock[];
}

/** A section introduces subsequent steps until the next section; it has no step number. */
export interface GuideSection {
  kind: 'section';
  numbering?: { restartAt: number } | undefined;
  id: string;
  title: string;
  paragraphs: GuideParagraph[];
}

/** The only guide content format; persistence owns lifecycle, revision and retained history. */
export interface GuideProject {
  /** A reusable local step with independently owned media; excluded from ordinary guide lists. */
  purpose?: 'step-template' | undefined;
  version: 4;
  htmlExport?: GuideHtmlImageSettings | undefined;
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
