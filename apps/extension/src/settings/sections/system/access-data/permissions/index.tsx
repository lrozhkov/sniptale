import { useState } from 'react';
import { PermissionsSectionContent } from './content';
import { useSettingsPermissions } from './useSettingsPermissions';

export function PermissionsSection() {
  const [view, setView] = useState<'optional' | 'required'>('optional');
  const { permissions, requestPermission, revokePermission, refreshPermissions } =
    useSettingsPermissions();

  return (
    <PermissionsSectionContent
      permissions={permissions}
      onRefresh={refreshPermissions}
      onRequestPermission={requestPermission}
      onRevokePermission={revokePermission}
      view={view}
      onViewChange={setView}
    />
  );
}
