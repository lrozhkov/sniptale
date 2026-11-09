import { z } from 'zod';
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import type { PersistenceMutationPermit } from '../../../composition/persistence/infrastructure/mutation-barrier';
import { isDesignReviewSessionPayload } from '../../../contracts/design-review-session';

export const DESIGN_REVIEW_SESSION_STORAGE_KEY = 'sniptale_design_review_sessions';
export const DESIGN_REVIEW_SESSION_BINDINGS_KEY = 'sniptale_design_review_bindings';
export const DESIGN_REVIEW_SESSION_CAP = 128;
const entry = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().nonnegative().safe(),
    payload: z.string().refine(isDesignReviewSessionPayload),
  })
  .strict();
const ledger = z
  .object({ version: z.literal(1), entries: z.array(entry).max(DESIGN_REVIEW_SESSION_CAP) })
  .strict();
const binding = z
  .object({ tabId: z.number().int().nonnegative().safe(), id: z.string().uuid() })
  .strict();
const bindings = z
  .object({ version: z.literal(1), tabs: z.array(binding).max(DESIGN_REVIEW_SESSION_CAP) })
  .strict();
export type DesignReviewSessionEntry = z.infer<typeof entry>;
export type DesignReviewSessionState = {
  entries: DesignReviewSessionEntry[];
  tabs: z.infer<typeof binding>[];
};
type StorageArea = {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>, permit?: PersistenceMutationPermit): Promise<void>;
  remove(key: string, permit?: PersistenceMutationPermit): Promise<void>;
};

/** Background service owns operation serialization; local records outlive session-only bindings. */
export class DesignReviewSessionStorage {
  constructor(
    private readonly local: StorageArea = browserStorage.local,
    private readonly session: StorageArea = browserStorage.session
  ) {}
  async read(): Promise<DesignReviewSessionState> {
    const local = (await this.local.get([DESIGN_REVIEW_SESSION_STORAGE_KEY]))[
      DESIGN_REVIEW_SESSION_STORAGE_KEY
    ];
    const session = (await this.session.get([DESIGN_REVIEW_SESSION_BINDINGS_KEY]))[
      DESIGN_REVIEW_SESSION_BINDINGS_KEY
    ];
    const entries = local === undefined ? [] : ledger.parse(local).entries;
    const tabs = session === undefined ? [] : bindings.parse(session).tabs;
    if (
      new Set(entries.map((item) => item.id)).size !== entries.length ||
      new Set(tabs.map((item) => item.tabId)).size !== tabs.length ||
      new Set(tabs.map((item) => item.id)).size !== tabs.length
    )
      throw new Error('Invalid Design Review session identities');
    return { entries, tabs };
  }
  async writeEntries(
    entries: DesignReviewSessionEntry[],
    permit: PersistenceMutationPermit
  ): Promise<void> {
    const value = ledger.parse({ version: 1, entries });
    await this.local.set({ [DESIGN_REVIEW_SESSION_STORAGE_KEY]: value }, permit);
  }
  async writeBindings(
    tabs: DesignReviewSessionState['tabs'],
    permit: PersistenceMutationPermit
  ): Promise<void> {
    const value = bindings.parse({ version: 1, tabs });
    if (tabs.length)
      await this.session.set({ [DESIGN_REVIEW_SESSION_BINDINGS_KEY]: value }, permit);
    else await this.session.remove(DESIGN_REVIEW_SESSION_BINDINGS_KEY, permit);
  }
}
