import { useEffect, useState } from 'react';

export function usePopoverInteractionDismissal(args: { blocked: boolean; isOpen: boolean }) {
  const [isChildInteractionOpen, setIsChildInteractionOpen] = useState(false);

  useEffect(() => {
    if (!args.isOpen) setIsChildInteractionOpen(false);
  }, [args.isOpen]);

  return {
    isDismissalEnabled: args.isOpen && !args.blocked && !isChildInteractionOpen,
    onFloatingInteractionChange: setIsChildInteractionOpen,
  };
}
