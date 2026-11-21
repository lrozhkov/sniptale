import { z } from 'zod';
import {
  parseReviewTextTemplate,
  type ReviewTextTemplate,
} from '../../../features/video/review/annotation-effects/text-templates';
import { browserStorage } from '../infrastructure/browser-storage';
import {
  tryRunWithPersistenceDomainMutationLock,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';

export const ANNOTATION_TEXT_TEMPLATES_KEY = 'sniptale_gallery_annotation_text_templates';

const idSchema = z.uuid();
const nameSchema = z.string().trim().min(1).max(80);
const recordSchema = z.strictObject({
  id: idSchema,
  revision: idSchema,
  name: nameSchema,
  template: z.unknown().transform((value, context) => {
    const template = parseReviewTextTemplate(value);
    if (template) return template;
    context.addIssue({ code: 'custom', message: 'Invalid Gallery text template' });
    return z.NEVER;
  }),
});
const catalogSchema = z.strictObject({
  version: z.literal(1),
  deletionRevision: idSchema.nullable(),
  records: z
    .array(recordSchema)
    .max(100)
    .refine((records) => new Set(records.map((record) => record.id)).size === records.length),
});

export type SavedReviewTextTemplate = z.infer<typeof recordSchema>;
type Catalog = z.infer<typeof catalogSchema>;

type Command =
  | {
      type: 'create';
      id: string;
      name: string;
      template: ReviewTextTemplate;
      afterDeletion: string | null;
    }
  | { type: 'update'; id: string; name: string; template: ReviewTextTemplate; previous: string }
  | { type: 'delete'; id: string; previous: string };

type Ports = {
  read(): Promise<unknown>;
  write(value: Catalog, permit: PersistenceMutationPermit): Promise<void>;
  mutate<T>(operation: (permit: PersistenceMutationPermit) => Promise<T>): Promise<T>;
};

function planCatalogChange(current: Catalog, command: Command): Catalog | boolean {
  const index = current.records.findIndex((item) => item.id === command.id);
  const existing = current.records[index];
  if (command.type === 'delete') {
    if (!existing || existing.revision !== command.previous) return false;
    return {
      ...current,
      deletionRevision: crypto.randomUUID(),
      records: current.records.filter((item) => item.id !== command.id),
    };
  }
  const saved = recordSchema.safeParse({
    id: command.id,
    revision: crypto.randomUUID(),
    name: command.name,
    template: command.template,
  });
  if (!saved.success) return false;
  if (command.type === 'update') {
    if (!existing || existing.revision !== command.previous) return false;
    return { ...current, records: current.records.with(index, saved.data) };
  }
  if (existing)
    return (
      existing.name === saved.data.name &&
      JSON.stringify(existing.template) === JSON.stringify(saved.data.template)
    );
  if (command.afterDeletion !== current.deletionRevision) return false;
  return { ...current, records: [...current.records, saved.data] };
}

/** Executes one user command against the latest profile snapshot under the persistence lock. */
export function createReviewTextTemplateStorage(ports: Ports) {
  const load = async (): Promise<Catalog> => {
    const raw = await ports.read();
    if (raw === undefined) return { version: 1, deletionRevision: null, records: [] };
    const catalog = catalogSchema.safeParse(raw);
    if (!catalog.success) throw new Error('Gallery text template catalog is unavailable');
    return catalog.data;
  };
  return {
    load,
    change: (command: Command) =>
      ports.mutate(async (permit) => {
        const next = planCatalogChange(await load(), command);
        if (typeof next === 'boolean') return next;
        const catalog = catalogSchema.safeParse(next);
        if (!catalog.success) return false;
        await ports.write(catalog.data, permit);
        return true;
      }),
  };
}

/** Reuses Gallery's local browser profile and shared privacy erasure barrier. */
export function createBrowserReviewTextTemplateStorage() {
  return {
    ...createReviewTextTemplateStorage({
      read: async () =>
        (await browserStorage.local.get([ANNOTATION_TEXT_TEMPLATES_KEY]))[
          ANNOTATION_TEXT_TEMPLATES_KEY
        ],
      write: (value, permit) =>
        browserStorage.local.set({ [ANNOTATION_TEXT_TEMPLATES_KEY]: value }, permit),
      mutate: async (operation) => {
        const result = await tryRunWithPersistenceDomainMutationLock(
          'gallery-text-templates',
          operation
        );
        if (result === null) throw new Error('Gallery template change refused during erasure');
        return result;
      },
    }),
    subscribe: (refresh: () => void) =>
      browserStorage.canObserveChanges()
        ? browserStorage.subscribeToChanges((changes, area) => {
            if (area === 'local' && ANNOTATION_TEXT_TEMPLATES_KEY in changes) refresh();
          })
        : () => undefined,
  };
}
