import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import type { VideoPreviewCacheDatabasePort, VideoPreviewCacheTransaction } from './database';

const DATABASE_INSTANCE_ID_KEY = 'database-instance-id';
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;

export interface VideoPreviewCacheJobToken {
  databaseInstanceId: string;
  jobId: string;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createDatabaseInstanceId(randomUUID: () => string): string {
  const databaseInstanceId = randomUUID();
  if (!isUuid(databaseInstanceId)) throw new Error('Video preview cache random ID is invalid');
  return databaseInstanceId;
}

export function isVideoPreviewCacheJobToken(value: unknown): value is VideoPreviewCacheJobToken {
  return isRecord(value) && isUuid(value['databaseInstanceId']) && isUuid(value['jobId']);
}

export async function beginVideoPreviewCacheJob(args: {
  database: VideoPreviewCacheDatabasePort;
  randomUUID(): string;
}): Promise<VideoPreviewCacheJobToken> {
  return runWithPersistenceMutationPermit(async () =>
    args.database.mutateOrCreate(async (transaction) => {
      const storedInstanceId = await transaction.getMetadata(DATABASE_INSTANCE_ID_KEY);
      const databaseInstanceId = isUuid(storedInstanceId)
        ? storedInstanceId
        : createDatabaseInstanceId(args.randomUUID);
      if (databaseInstanceId !== storedInstanceId) {
        await transaction.putMetadata(DATABASE_INSTANCE_ID_KEY, databaseInstanceId);
      }
      const jobId = args.randomUUID();
      if (!isUuid(jobId)) throw new Error('Video preview cache random ID is invalid');
      return { databaseInstanceId, jobId };
    })
  );
}

export async function invalidateVideoPreviewCacheJobs(
  transaction: VideoPreviewCacheTransaction,
  randomUUID: () => string
): Promise<void> {
  await transaction.putMetadata(DATABASE_INSTANCE_ID_KEY, createDatabaseInstanceId(randomUUID));
}

export async function hasCurrentVideoPreviewCacheInstance(
  transaction: VideoPreviewCacheTransaction,
  token: VideoPreviewCacheJobToken
): Promise<boolean> {
  return (await transaction.getMetadata(DATABASE_INSTANCE_ID_KEY)) === token.databaseInstanceId;
}
