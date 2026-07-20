import { useEffect } from 'react';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';
import { getQuickActions } from '../../../../composition/persistence/quick-actions';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import { createQuickActionHotkeyRuntime } from '../../../platform/quick-action-hotkeys';

export function useQuickActionHotkeys(): void {
  useEffect(() => {
    const services = getContentRuntimeServices();
    const runtime = createQuickActionHotkeyRuntime({
      getActions: getQuickActions,
      storage: browserStorage,
      triggerQuickAction: async (action, event) => {
        const source = services.contentActionIntent.createTrustedContentActionIntentSource(event);
        const message = await services.contentActionIntent.attachContentActionIntent(
          {
            actionId: action.id,
            type: MessageType.TRIGGER_QUICK_ACTION,
          },
          source
        );
        await services.messaging.sendRuntimeMessage(message);
      },
    });
    runtime.start();
    return runtime.stop;
  }, []);
}
