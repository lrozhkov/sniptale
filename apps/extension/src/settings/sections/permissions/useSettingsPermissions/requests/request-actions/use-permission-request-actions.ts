import { useMemo } from 'react';

import { createRequestChromeAction } from './request-chrome';
import { createRequestCameraAction } from './request-camera';
import { createRequestMicrophoneAction } from './request-microphone';
import { createRequestOriginAction } from './request-origin';
import type { PermissionSetter } from '../../types';

export function usePermissionRequestActions(setPermissions: PermissionSetter) {
  return useMemo(
    () => ({
      requestMicrophone: createRequestMicrophoneAction(setPermissions),
      requestCamera: createRequestCameraAction(setPermissions),
      requestChrome: createRequestChromeAction(setPermissions),
      requestOrigin: createRequestOriginAction(setPermissions),
    }),
    [setPermissions]
  );
}
