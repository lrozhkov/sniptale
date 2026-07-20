import { useState } from 'react';
import { translate } from '../../../platform/i18n';
import { SearchableProjectPicker } from '@sniptale/ui/searchable-project-picker';
import { ScenarioProjectRow } from './projects-view.rows';
import { ScenarioProjectsHeader } from './projects-view.sections';
import type { ScenarioProjectsViewController } from './types';

export function ScenarioSlideNavigatorProjectsView(props: {
  controller: ScenarioProjectsViewController;
}) {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  return (
    <div className="grid min-h-0 gap-4 p-3">
      <ScenarioProjectsHeader />

      <SearchableProjectPicker
        activeProjectId={props.controller.project.projectId}
        allProjectsLabel={translate('scenario.editor.allProjects')}
        createButtonLabel={translate('scenario.editor.createProject')}
        dataUiPrefix="scenario.editor.projects-view"
        emptyLabel={translate('scenario.editor.noProjects')}
        noResultsLabel={translate('scenario.editor.noProjectResults')}
        onCreateProject={props.controller.projectCrud.createProject}
        onSearchQueryChange={props.controller.project.setCreateName}
        onSelectProject={(projectId) => void props.controller.projectCrud.selectProject(projectId)}
        projects={props.controller.project.projects}
        renderProjectRow={({ active, dataUi, onSelect, project }) => (
          <ScenarioProjectRow
            key={project.id}
            active={active}
            controller={props.controller}
            {...(dataUi === undefined ? {} : { dataUi })}
            editingName={editingName}
            editingProjectId={editingProjectId}
            onEditingNameChange={setEditingName}
            onEditingProjectChange={setEditingProjectId}
            onSelect={onSelect}
            project={project}
          />
        )}
        recentProjectsLabel={translate('scenario.editor.recentProjects')}
        searchQuery={props.controller.project.createName}
        searchPlaceholder={translate('scenario.editor.searchProjects')}
      />
    </div>
  );
}
