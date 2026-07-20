import React from 'react';
import type { TemplateListProps } from './types';
import { useTemplateListState } from './state';
import { TemplateListContent } from './view';

export const TemplateList: React.FC<TemplateListProps> = (props) => {
  const state = useTemplateListState(props);
  return <TemplateListContent {...props} state={state} />;
};
