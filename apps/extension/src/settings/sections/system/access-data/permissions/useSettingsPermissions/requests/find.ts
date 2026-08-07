import type { PermissionInfo } from '../../permissions-lib';

export function findPermissionById(permissions: PermissionInfo[], permissionId: string) {
  return permissions.find((item) => item.id === permissionId) ?? null;
}
