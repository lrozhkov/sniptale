import { PermissionsSectionContent } from './content';
import { useSettingsPermissions } from './useSettingsPermissions';

export function PermissionsSection() {
  const { permissions, requestPermission, revokePermission, refreshPermissions } =
    useSettingsPermissions();

  return (
    <PermissionsSectionContent
      permissions={permissions}
      onRefresh={refreshPermissions}
      onRequestPermission={requestPermission}
      onRevokePermission={revokePermission}
    />
  );
}
