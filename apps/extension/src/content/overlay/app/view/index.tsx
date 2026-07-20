import React from 'react';

import { preloadAIModal } from '../../ai/modal/shell/lazy';
import { ContentAppLayout } from '../../app-layout';
import { buildContentAppLayoutProps } from '../../app-layout/props';
import { InteractiveFrame } from '../../../selection/interactive-frame';
import { useContentAppViewModel } from '../view-state/hook';

export const App: React.FC = () => {
  const viewModel = useContentAppViewModel({
    InteractiveFrameComponent: InteractiveFrame,
    preloadAIModal,
  });
  const layoutProps = buildContentAppLayoutProps(viewModel);

  return <ContentAppLayout {...layoutProps} />;
};
