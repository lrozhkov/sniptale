import type { AssetOwner, AssetRef, PhysicalDeleteAssetOperation } from '../assets';
import type { PersistedEditorDocumentV3 } from './contracts';

interface EditorDocumentAssetStores {
  owners: {
    delete?: ((key: [string, string, string]) => Promise<unknown>) | undefined;
    index?: ((name: 'assetId') => { count(assetId: string): Promise<number> }) | undefined;
    put?: ((owner: AssetOwner) => Promise<unknown>) | undefined;
  };
  refs: {
    delete?: ((assetId: string) => Promise<unknown>) | undefined;
    put?: ((ref: AssetRef) => Promise<unknown>) | undefined;
  };
}

export function editorDocumentAssetIds(document: PersistedEditorDocumentV3): string[] {
  return [...new Set(document.assets.map((asset) => asset.assetId))];
}

export async function replaceEditorDocumentAssetOwnership(args: {
  nextDocument: PersistedEditorDocumentV3;
  nextRefs: readonly AssetRef[];
  ownerId: string;
  ownerKind: string;
  previousDocument: PersistedEditorDocumentV3 | null;
  physicalDelete: PhysicalDeleteAssetOperation;
  stores: EditorDocumentAssetStores;
}): Promise<void> {
  const nextRoles = new Set(args.nextDocument.assets.map((asset) => asset.role));
  for (const previous of args.previousDocument?.assets ?? []) {
    if (nextRoles.has(previous.role)) continue;
    await removeEditorDocumentAssetOwner({
      assetId: previous.assetId,
      ownerId: args.ownerId,
      ownerKind: args.ownerKind,
      physicalDelete: args.physicalDelete,
      role: previous.role,
      stores: args.stores,
    });
  }
  for (const previous of args.previousDocument?.assets ?? []) {
    const replacement = args.nextDocument.assets.find((asset) => asset.role === previous.role);
    if (!replacement || replacement.assetId === previous.assetId) continue;
    await removeEditorDocumentAssetOwner({
      assetId: previous.assetId,
      ownerId: args.ownerId,
      ownerKind: args.ownerKind,
      physicalDelete: args.physicalDelete,
      role: previous.role,
      stores: args.stores,
    });
  }
  const refsById = new Map(args.nextRefs.map((ref) => [ref.assetId, ref]));
  for (const asset of args.nextDocument.assets) {
    const ref = refsById.get(asset.assetId);
    if (!ref) throw new Error(`Prepared editor document ref is missing: ${asset.assetId}.`);
    await args.stores.refs.put!(ref);
    await args.stores.owners.put!({
      assetId: asset.assetId,
      ownerId: args.ownerId,
      ownerKind: args.ownerKind,
      role: asset.role,
    });
  }
}

export async function removeEditorDocumentOwnership(args: {
  document: PersistedEditorDocumentV3;
  ownerId: string;
  ownerKind: string;
  physicalDelete: PhysicalDeleteAssetOperation;
  stores: EditorDocumentAssetStores;
}): Promise<void> {
  for (const asset of args.document.assets) {
    await removeEditorDocumentAssetOwner({ ...args, assetId: asset.assetId, role: asset.role });
  }
}

async function removeEditorDocumentAssetOwner(args: {
  assetId: string;
  ownerId: string;
  ownerKind: string;
  physicalDelete: PhysicalDeleteAssetOperation;
  role: string;
  stores: EditorDocumentAssetStores;
}): Promise<void> {
  await args.stores.owners.delete!([args.ownerKind, args.ownerId, args.role]);
  if ((await args.stores.owners.index!('assetId').count(args.assetId)) === 0) {
    await args.stores.refs.delete!(args.assetId);
    args.physicalDelete.assetIds.push(args.assetId);
  }
}
