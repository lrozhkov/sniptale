import { z } from 'zod';
import type { ContextMenuSettings, QuickAction, ViewportPreset } from './index';

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

const legacyLayoutSchema = z
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
export type LegacyContextMenuLayout = z.infer<typeof legacyLayoutSchema>;

/** Dispatchable browser menu leaves. Their values are the existing Chrome action IDs. */
export const CONTEXT_MENU_STATIC_COMMANDS = [
  'sniptale.screenshots.prepare',
  'sniptale.video.tab',
  'sniptale.video.area',
  'sniptale.video.preset',
  'sniptale.video.window',
  'sniptale.export.start',
  'sniptale.export.copy-json',
  'sniptale.export.copy-markdown',
  'sniptale.image-editor',
  'sniptale.video-editor',
  'sniptale.gallery',
  'sniptale.page-link.rich',
  'sniptale.page-link.markdown',
  'sniptale.page-link.plain',
  'sniptale.settings',
] as const;

export type ContextMenuStaticCommand = (typeof CONTEXT_MENU_STATIC_COMMANDS)[number];
export interface ContextMenuCommandNode {
  type: 'command';
  command: string;
  enabled: boolean;
  title?: string | undefined;
}
export interface ContextMenuSectionNode {
  type: 'section';
  id: string;
  title: string;
  enabled: boolean;
  children: ContextMenuCommandNode[];
}
export type ContextMenuTreeNode = ContextMenuSectionNode | ContextMenuCommandNode;
export interface ContextMenuTree {
  version: 2;
  nodes: ContextMenuTreeNode[];
}
export type ContextMenuLayout = LegacyContextMenuLayout | ContextMenuTree;

export const CONTEXT_MENU_MAX_SECTIONS = 9;
export const CONTEXT_MENU_MAX_NODES = 1024;
export const CONTEXT_MENU_SECTION_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const QUICK_ACTION_PREFIX = 'sniptale.screenshots.quick-action.';
const WINDOW_PRESET_PREFIX = 'sniptale.window-resize.preset.';
function hasUnsafeControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (
      code < 32 ||
      (code >= 127 && code <= 159) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    );
  });
}
function isValidDynamicId(id: string): boolean {
  return id.length > 0 && id === id.trim() && !hasUnsafeControlCharacter(id);
}
const titleSchema = z
  .string()
  .min(1)
  .max(40)
  .refine((title) => title === title.trim() && !hasUnsafeControlCharacter(title));

/** Dynamic references remain valid when their inventory entry is temporarily unavailable. */
export function isContextMenuCommandId(command: string): boolean {
  if ((CONTEXT_MENU_STATIC_COMMANDS as readonly string[]).includes(command)) return true;
  if (command.startsWith(QUICK_ACTION_PREFIX)) {
    return isValidDynamicId(command.slice(QUICK_ACTION_PREFIX.length));
  }
  if (command.startsWith(WINDOW_PRESET_PREFIX)) {
    const encoded = command.slice(WINDOW_PRESET_PREFIX.length);
    try {
      const id = decodeURIComponent(encoded);
      return isValidDynamicId(id) && encodeURIComponent(id) === encoded;
    } catch {
      return false;
    }
  }
  return false;
}

const commandSchema = z
  .object({
    type: z.literal('command'),
    command: z.string().refine(isContextMenuCommandId),
    enabled: z.boolean(),
    title: titleSchema.optional(),
  })
  .strict();
const sectionSchema = z
  .object({
    type: z.literal('section'),
    id: z
      .string()
      .regex(CONTEXT_MENU_SECTION_ID_PATTERN)
      .refine((id) => id !== 'root'),
    title: titleSchema,
    enabled: z.boolean(),
    children: z.array(commandSchema).max(CONTEXT_MENU_MAX_NODES),
  })
  .strict();
const treeSchema = z
  .object({
    version: z.literal(2),
    nodes: z.array(z.union([commandSchema, sectionSchema])).max(CONTEXT_MENU_MAX_NODES),
  })
  .strict()
  .superRefine((tree, context) => {
    const sections = tree.nodes.filter((node) => node.type === 'section');
    const commands = tree.nodes.flatMap((node) =>
      node.type === 'section' ? node.children : [node]
    );
    if (
      sections.length > CONTEXT_MENU_MAX_SECTIONS ||
      tree.nodes.length + sections.reduce((count, section) => count + section.children.length, 0) >
        CONTEXT_MENU_MAX_NODES ||
      new Set(sections.map((section) => section.id)).size !== sections.length ||
      new Set(commands.map((node) => node.command)).size !== commands.length
    )
      context.addIssue({ code: 'custom', message: 'Invalid context menu tree' });
  });

export function parseContextMenuTree(value: unknown): ContextMenuTree | null {
  const parsed = treeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Storage-only repair. Imported layouts must pass the strict parser instead. */
export function repairStoredContextMenuTree(value: unknown): ContextMenuTree | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate['version'] !== 2 || !Array.isArray(candidate['nodes'])) return null;
  const nodes: ContextMenuTreeNode[] = [];
  const commandIds = new Set<string>();
  const sectionIds = new Set<string>();
  let nodeCount = 0;
  const addCommand = (input: unknown, target: ContextMenuTreeNode[], parentEnabled = true) => {
    if (nodeCount >= CONTEXT_MENU_MAX_NODES) return;
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success || commandIds.has(parsed.data.command)) return;
    commandIds.add(parsed.data.command);
    target.push({ ...parsed.data, enabled: parsed.data.enabled && parentEnabled });
    nodeCount += 1;
  };
  const storedNodes = candidate['nodes'] as unknown[];
  for (const rawNode of storedNodes.slice(0, CONTEXT_MENU_MAX_NODES * 5)) {
    if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) continue;
    const node = rawNode as Record<string, unknown>;
    if (node['type'] === 'command') {
      addCommand(node, nodes);
      continue;
    }
    if (node['type'] !== 'section') continue;
    const children: unknown[] = Array.isArray(node['children'])
      ? (node['children'] as unknown[]).slice(0, CONTEXT_MENU_MAX_NODES * 5)
      : [];
    const header = sectionSchema.safeParse({ ...node, children: [] });
    const canKeepSection =
      header.success &&
      !sectionIds.has(header.data.id) &&
      sectionIds.size < CONTEXT_MENU_MAX_SECTIONS &&
      nodeCount < CONTEXT_MENU_MAX_NODES;
    const section: ContextMenuSectionNode | null =
      canKeepSection && header.success ? header.data : null;
    if (section) {
      sectionIds.add(section.id);
      nodes.push(section);
      nodeCount += 1;
    }
    for (const child of children) {
      if (section) addCommand(child, section.children);
      else addCommand(child, nodes, node['enabled'] === true);
    }
  }
  return nodes.length > 0 ? { version: 2, nodes } : null;
}

/** Validate untrusted persisted or imported layout without repairing the input. */
export function parseContextMenuLayout(value: unknown): ContextMenuLayout | null {
  return parseContextMenuTree(value) ?? parseLegacyContextMenuLayout(value);
}

export function parseLegacyContextMenuLayout(value: unknown): LegacyContextMenuLayout | null {
  const parsed = legacyLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Fresh legacy ordering, also used when no explicit layout has been saved. */
export function createContextMenuLayout(): LegacyContextMenuLayout {
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

export type ContextMenuQuickActionInventory = readonly Pick<QuickAction, 'id' | 'status'>[];
export type ContextMenuViewportPresetInventory = readonly Pick<
  ViewportPreset,
  'id' | 'enabled' | 'target' | 'order'
>[];

/** Inventory availability affects projection, never the validity of a saved reference. */
export function isContextMenuCommandAvailable(
  command: string,
  quickActions: ContextMenuQuickActionInventory,
  viewportPresets: ContextMenuViewportPresetInventory
): boolean {
  if ((CONTEXT_MENU_STATIC_COMMANDS as readonly string[]).includes(command)) return true;
  if (!isContextMenuCommandId(command)) return false;
  if (command.startsWith(QUICK_ACTION_PREFIX)) {
    const id = command.slice(QUICK_ACTION_PREFIX.length);
    return quickActions.some((action) => action.id === id && action.status);
  }
  const id = decodeURIComponent(command.slice(WINDOW_PRESET_PREFIX.length));
  return viewportPresets.some(
    (preset) => preset.id === id && preset.enabled && preset.target === 'window'
  );
}

const LEGACY_COMMANDS: Record<ContextMenuItemKey, readonly ContextMenuStaticCommand[]> = {
  showScreenshots: ['sniptale.screenshots.prepare'],
  showVideo: [
    'sniptale.video.tab',
    'sniptale.video.area',
    'sniptale.video.preset',
    'sniptale.video.window',
  ],
  showExport: [
    'sniptale.export.start',
    'sniptale.export.copy-json',
    'sniptale.export.copy-markdown',
  ],
  showImageEditor: ['sniptale.image-editor'],
  showVideoEditor: ['sniptale.video-editor'],
  showGallery: ['sniptale.gallery'],
  showPageLinkCopy: [
    'sniptale.page-link.rich',
    'sniptale.page-link.markdown',
    'sniptale.page-link.plain',
  ],
  showWindowResize: [],
  showSettings: ['sniptale.settings'],
};

function projectedBlock(
  key: ContextMenuItemKey,
  enabled: boolean,
  quickActions: ContextMenuQuickActionInventory,
  viewportPresets: ContextMenuViewportPresetInventory
): ContextMenuCommandNode[] {
  const commands: string[] = [...LEGACY_COMMANDS[key]];
  if (key === 'showScreenshots') {
    commands.push(
      ...quickActions
        .filter((action) => action.status)
        .map((action) => `${QUICK_ACTION_PREFIX}${action.id}`)
    );
  }
  if (key === 'showWindowResize') {
    commands.push(
      ...viewportPresets
        .filter((preset) => preset.enabled && preset.target === 'window')
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
        .map((preset) => `${WINDOW_PRESET_PREFIX}${encodeURIComponent(preset.id)}`)
    );
  }
  return commands.map((command) => ({ type: 'command', command, enabled }));
}

/** Pure read projection. Legacy booleans apply only until an explicit v2 layout is saved. */
export function resolveContextMenuTree(
  settings: ContextMenuSettings,
  quickActions: ContextMenuQuickActionInventory,
  viewportPresets: ContextMenuViewportPresetInventory
): ContextMenuTree {
  const explicit = parseContextMenuTree(settings.layout);
  if (explicit) return explicit;

  const legacy = parseLegacyContextMenuLayout(settings.layout) ?? createContextMenuLayout();
  const seen = new Set<string>();
  const projectItems = (items: readonly ContextMenuItemKey[]): ContextMenuCommandNode[] =>
    items
      .flatMap((key) => projectedBlock(key, settings[key], quickActions, viewportPresets))
      .filter((node) => {
        if (seen.has(node.command)) return false;
        seen.add(node.command);
        return true;
      });
  const nodes: ContextMenuTreeNode[] = [];
  for (const section of legacy.sections) {
    if (section.id === 'root') {
      nodes.push(...projectItems(section.items));
    } else {
      nodes.push({
        type: 'section',
        id: section.id,
        title: section.title,
        enabled: true,
        children: projectItems(section.items),
      });
    }
  }
  return { version: 2, nodes };
}

/** Recommended editor draft; caller supplies current dynamic inventories. */
export function createRecommendedContextMenuTree(
  quickActions: ContextMenuQuickActionInventory,
  viewportPresets: ContextMenuViewportPresetInventory
): ContextMenuTree {
  return resolveContextMenuTree(
    createRecommendedContextMenuSettings(),
    quickActions,
    viewportPresets
  );
}
