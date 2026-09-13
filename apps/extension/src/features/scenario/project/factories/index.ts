import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import type {
  GuideImageBlock,
  GuideParagraph,
  GuideProject,
  GuideStep,
} from '@sniptale/runtime-contracts/scenario/types/guide';

/** Creates a local guide with caller-supplied identity and time when needed. */
export function createGuideProject(
  name: string,
  id: string = crypto.randomUUID(),
  now = Date.now()
): GuideProject {
  return {
    version: 4,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    tags: [],
    style: {
      theme: 'paper',
      font: 'sans',
      density: 'comfortable',
      contentWidth: 'standard',
      imageBorder: 'subtle',
      numberStyle: 'badge',
      accentColor: null,
    },
    print: { pageSize: 'a4', orientation: 'portrait', pagination: 'flow' },
    items: [],
  };
}

/** Preserves paragraph boundaries without interpreting markup. */
export function createGuideParagraphs(text: string): GuideParagraph[] {
  return text.split(/\r?\n/).map((paragraph) => ({
    runs: [{ text: paragraph, bold: false, italic: false, href: null }],
  }));
}

/** Creates a numbered step whose content blocks are independently optional. */
export function createGuideStep(title = '', id: string = crypto.randomUUID()): GuideStep {
  return {
    kind: 'step',
    id,
    title,
    showNumber: true,
    layout: 'stacked',
    templateId: null,
    styleOverrides: {},
    blocks: [],
  };
}

/** References a logical scenario asset; physical media ownership stays in persistence. */
export function createGuideImageBlock(args: {
  id: string;
  assetId: string;
  width: number;
  height: number;
  source: GuideImageBlock['source'];
  galleryAssetId?: string | null;
  editDocumentId?: string | null;
}): GuideImageBlock {
  const frameScale = Math.min(1, GUIDE_LIMITS.maxDimension / Math.max(args.width, args.height));
  return {
    kind: 'image',
    id: args.id,
    assetId: args.assetId,
    galleryAssetId: args.galleryAssetId ?? null,
    editDocumentId: args.editDocumentId ?? null,
    alt: '',
    caption: '',
    source: args.source,
    frame: { width: args.width * frameScale, height: args.height * frameScale },
    fit: 'contain',
    contentTransform: { x: 0, y: 0, scale: 1 },
  };
}

/** Creates an independent interactive representation without acquiring media or changing the guide. */
export function createTourDocument(
  id: string = crypto.randomUUID()
): import('@sniptale/runtime-contracts/scenario/types/tour').TourDocument {
  return {
    version: 1,
    id,
    stage: { aspect: '16:9', background: '#111827' },
    style: {
      accent: '#f97316',
      text: '#ffffff',
      surface: '#1f2937',
      textAppearance: { presentation: 'callout', alignment: 'start', placement: 'auto' },
    },
    playback: { autoplay: false, loop: false, minimumHoldSeconds: 4, autoZoom: true },
    transition: { kind: 'fade', durationMs: 250, hotspotTravelMs: 300 },
    slides: [],
    endScreen: { enabled: true, title: '', description: '', button: null, restart: true },
  };
}

/** Empty image slides remain editable; export admission must require populated media. */
export function createTourImageSlide(
  id: string = crypto.randomUUID()
): import('@sniptale/runtime-contracts/scenario/types/tour').TourImageSlide {
  return {
    kind: 'image',
    id,
    title: '',
    image: null,
    origin: null,
    fit: 'contain',
    camera: { mode: 'inherit', center: { x: 0.5, y: 0.5 }, zoom: 1 },
    hotspots: [],
    annotations: [],
    masks: [],
    narration: null,
    timing: { mode: 'inherit', holdSeconds: 4, truncateNarration: false, autoplayTarget: null },
  };
}
