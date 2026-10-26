import { z } from 'zod';
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import {
  runWithPersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../../../composition/persistence/infrastructure/mutation-barrier';
import { PAGE_RECOVERY_TTL_MS, isPageRecoveryPayload } from '../../../contracts/page-recovery';

export const PAGE_RECOVERY_STORAGE_KEY = 'sniptale_page_recovery';
export const PAGE_RECOVERY_CLAIMS_KEY = 'sniptale_page_recovery_claims';
const entrySchema = z
  .object({
    nonce: z.string().uuid(),
    pageUrl: z.string().url().max(16_384),
    payload: z.string().refine(isPageRecoveryPayload).nullable(),
    changedAt: z.number().int().nonnegative(),
  })
  .strict();
const ledgerSchema = z
  .object({ version: z.literal(1), entries: z.array(entrySchema).max(2000) })
  .strict();
const claimSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    documentId: z.string().min(1).max(256),
    nonce: z.string().uuid(),
    lease: z.string().uuid(),
  })
  .strict();
const claimsSchema = z
  .object({ version: z.literal(1), tabs: z.array(claimSchema).max(2000) })
  .strict();
export type PageRecoveryClaim = z.infer<typeof claimSchema>;
type StoredRecovery = z.infer<typeof entrySchema>;
type RecoveryLedger = z.infer<typeof ledgerSchema>;
type StorageArea = {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>, permit?: PersistenceMutationPermit): Promise<void>;
  remove(key: string, permit?: PersistenceMutationPermit): Promise<void>;
};

/** One background owner serializes the entire read/check/write operation and acknowledges writes. */
export class PageRecoveryStorage {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly area: StorageArea = browserStorage.local,
    private readonly now = Date.now,
    private readonly sessionArea: StorageArea = browserStorage.session
  ) {}

  private alive = (entry: StoredRecovery) => this.now() - entry.changedAt < PAGE_RECOVERY_TTL_MS;
  private async readLedger(): Promise<RecoveryLedger> {
    const raw = (await this.area.get([PAGE_RECOVERY_STORAGE_KEY]))[PAGE_RECOVERY_STORAGE_KEY];
    if (raw === undefined) return { version: 1, entries: [] };
    const ledger = ledgerSchema.parse(raw);
    if (new Set(ledger.entries.map((entry) => entry.nonce)).size !== ledger.entries.length)
      throw new Error('Invalid page recovery identities');
    return ledger;
  }
  private mutate<T>(change: (ledger: RecoveryLedger) => T): Promise<T> {
    const operation = this.queue.then(() =>
      runWithPersistenceMutationPermit(async (permit) => {
        const ledger = await this.readLedger();
        ledger.entries = ledger.entries.filter(this.alive);
        const result = change(ledger);
        ledgerSchema.parse(ledger);
        if (ledger.entries.length)
          await this.area.set({ [PAGE_RECOVERY_STORAGE_KEY]: ledger }, permit);
        else await this.area.remove(PAGE_RECOVERY_STORAGE_KEY, permit);
        return result;
      })
    );
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  async read(nonce: string, pageUrl: string): Promise<StoredRecovery | null> {
    await this.queue;
    const entry = (await this.readLedger()).entries.find((item) => item.nonce === nonce);
    return entry && this.alive(entry) && entry.pageUrl === pageUrl ? entry : null;
  }
  save(nonce: string, pageUrl: string, payload: string, changedAt = this.now()): Promise<void> {
    return this.mutate((ledger) => {
      const prior = ledger.entries.find((entry) => entry.nonce === nonce);
      if (
        changedAt > this.now() ||
        this.now() - changedAt >= PAGE_RECOVERY_TTL_MS ||
        (prior && changedAt < prior.changedAt)
      )
        throw new Error('Page recovery timestamp is stale');
      const next = entrySchema.parse({
        nonce,
        pageUrl,
        payload,
        changedAt,
      });
      ledger.entries = [...ledger.entries.filter((entry) => entry.nonce !== nonce), next];
    });
  }
  discard(nonce: string): Promise<void> {
    return this.mutate((ledger) => {
      ledger.entries = ledger.entries.filter((entry) => entry.nonce !== nonce);
    });
  }
  private async readClaims() {
    const raw = (await this.sessionArea.get([PAGE_RECOVERY_CLAIMS_KEY]))[PAGE_RECOVERY_CLAIMS_KEY];
    const claims = raw === undefined ? { version: 1 as const, tabs: [] } : claimsSchema.parse(raw);
    if (new Set(claims.tabs.map((claim) => claim.tabId)).size !== claims.tabs.length)
      throw new Error('Invalid page recovery tab claims');
    return claims;
  }
  private changeClaims<T>(change: (claims: z.infer<typeof claimsSchema>) => T): Promise<T> {
    const operation = this.queue.then(() =>
      runWithPersistenceMutationPermit(async (permit) => {
        const claims = await this.readClaims();
        const result = change(claims);
        claimsSchema.parse(claims);
        if (claims.tabs.length)
          await this.sessionArea.set({ [PAGE_RECOVERY_CLAIMS_KEY]: claims }, permit);
        else await this.sessionArea.remove(PAGE_RECOVERY_CLAIMS_KEY, permit);
        return result;
      })
    );
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  bindTab(tabId: number, documentId: string): Promise<PageRecoveryClaim> {
    return this.changeClaims((claims) => {
      const prior = claims.tabs.find((claim) => claim.tabId === tabId);
      const claim = claimSchema.parse({
        tabId,
        documentId,
        nonce: prior?.nonce ?? crypto.randomUUID(),
        lease: crypto.randomUUID(),
      });
      claims.tabs = [...claims.tabs.filter((entry) => entry.tabId !== tabId), claim];
      return claim;
    });
  }
  async getClaim(tabId: number): Promise<PageRecoveryClaim | null> {
    await this.queue;
    return (await this.readClaims()).tabs.find((claim) => claim.tabId === tabId) ?? null;
  }
  rotateLease(tabId: number, documentId: string, lease: string): Promise<PageRecoveryClaim> {
    return this.changeClaims((claims) => {
      const claim = claims.tabs.find((entry) => entry.tabId === tabId);
      if (!claim || claim.documentId !== documentId || claim.lease !== lease)
        throw new Error('Page recovery lease is stale');
      claim.lease = crypto.randomUUID();
      return claim;
    });
  }
  forgetTab(tabId: number): Promise<void> {
    return this.changeClaims((claims) => {
      claims.tabs = claims.tabs.filter((entry) => entry.tabId !== tabId);
    });
  }
  async nextExpiry(): Promise<number | null> {
    await this.queue;
    const entries = (await this.readLedger()).entries;
    return entries.length
      ? Math.min(...entries.map((entry) => entry.changedAt + PAGE_RECOVERY_TTL_MS))
      : null;
  }
  sweep(): Promise<void> {
    return this.mutate(() => undefined);
  }
}
