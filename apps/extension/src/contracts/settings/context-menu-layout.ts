import { z } from 'zod';

/** Stable block identities shared by settings, transfer and browser menu projection. */
export const CONTEXT_MENU_ITEMS = [
  'showScreenshots',
  'showVideo',
  'showExport',
  'showImageEditor',
  'showVideoEditor',
  'showGallery',
  'showPageLinkCopy',
  'showWindowResize',
  'showSettings',
] as const;

export type ContextMenuItemKey = (typeof CONTEXT_MENU_ITEMS)[number];

const layoutSchema = z
  .object({
    version: z.literal(1),
    sections: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
            title: z.string().max(40),
            items: z.array(z.enum(CONTEXT_MENU_ITEMS)).max(CONTEXT_MENU_ITEMS.length),
          })
          .strict()
      )
      .min(1)
      .max(10),
  })
  .strict()
  .superRefine((layout, context) => {
    const ids = layout.sections.map((section) => section.id);
    const items = layout.sections.flatMap((section) => section.items);
    if (
      !ids.includes('root') ||
      new Set(ids).size !== ids.length ||
      items.length !== CONTEXT_MENU_ITEMS.length ||
      new Set(items).size !== items.length ||
      layout.sections.some((section) =>
        section.id === 'root'
          ? section.title !== ''
          : section.title.trim().length === 0 ||
            section.title !== section.title.trim() ||
            [...section.title].some(
              (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
            )
      )
    )
      context.addIssue({ code: 'custom', message: 'Invalid context menu layout' });
  });

/** One-level sections; the reserved root section emits its blocks directly below Sniptale. */
export type ContextMenuLayout = z.infer<typeof layoutSchema>;

/** Validate untrusted persisted or imported layout without repairing the input. */
export function parseContextMenuLayout(value: unknown): ContextMenuLayout | null {
  const parsed = layoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Fresh legacy ordering, also used when no explicit layout has been saved. */
export function createContextMenuLayout(): ContextMenuLayout {
  return { version: 1, sections: [{ id: 'root', title: '', items: [...CONTEXT_MENU_ITEMS] }] };
}

/** Recommended visibility for new profiles and explicit reset; returns an isolated value. */
export function createRecommendedContextMenuSettings(): Record<
  ContextMenuItemKey | 'enabled',
  boolean
> & { layout?: ContextMenuLayout } {
  return {
    enabled: true,
    showScreenshots: true,
    showVideo: true,
    showExport: true,
    showImageEditor: false,
    showVideoEditor: false,
    showGallery: true,
    showPageLinkCopy: true,
    showWindowResize: false,
    showSettings: true,
  };
}
