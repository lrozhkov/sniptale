import React from 'react';

export function useExpandedActionsVisibility() {
  const [expandedActionsVisible, setExpandedActionsVisible] = React.useState(false);

  function showExpandedActions() {
    setExpandedActionsVisible(true);
  }

  function hideExpandedActions() {
    setExpandedActionsVisible(false);
  }

  return {
    expandedActionsVisible,
    hideExpandedActions,
    showExpandedActions,
  };
}
