import type { ProjectListItem, RecordingListItem } from '../contracts/items';

const RECENT_PROJECT_LIMIT = 3;
const RECENT_RECORDING_LIMIT = 4;

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function matchesProject(project: ProjectListItem, query: string): boolean {
  return project.name.toLowerCase().includes(query);
}

function matchesRecording(recording: RecordingListItem, query: string): boolean {
  return recording.filename.toLowerCase().includes(query);
}

function sortProjects(items: ProjectListItem[]): ProjectListItem[] {
  return [...items].sort((left, right) => right.updatedAt - left.updatedAt);
}

function sortRecordings(items: RecordingListItem[]): RecordingListItem[] {
  return [...items].sort((left, right) => right.createdAt - left.createdAt);
}

function sliceRecentProjects(
  items: ProjectListItem[],
  activeProjectId: string | null
): ProjectListItem[] {
  return items.filter((item) => item.id !== activeProjectId).slice(0, RECENT_PROJECT_LIMIT);
}

function splitRemainder<T extends { id: string }>(items: T[], recentItems: T[]): T[] {
  const recentIds = new Set(recentItems.map((item) => item.id));
  return items.filter((item) => !recentIds.has(item.id));
}

export function buildLibraryPanelState(args: {
  activeProjectId: string | null;
  projects: ProjectListItem[];
  query: string;
  recordings: RecordingListItem[];
}) {
  const normalizedQuery = normalizeQuery(args.query);
  const hasQuery = normalizedQuery.length > 0;
  const projects = sortProjects(args.projects).filter((item) =>
    hasQuery ? matchesProject(item, normalizedQuery) : true
  );
  const recordings = sortRecordings(args.recordings).filter((item) =>
    hasQuery ? matchesRecording(item, normalizedQuery) : true
  );
  const recentProjects = hasQuery ? [] : sliceRecentProjects(projects, args.activeProjectId);
  const recentRecordings = hasQuery ? [] : recordings.slice(0, RECENT_RECORDING_LIMIT);
  const projectRemainder = splitRemainder(projects, recentProjects);
  const recordingRemainder = splitRemainder(recordings, recentRecordings);
  const splitProjects = !hasQuery && recentProjects.length > 0 && projectRemainder.length > 0;
  const splitRecordings = !hasQuery && recentRecordings.length > 0 && recordingRemainder.length > 0;

  return {
    hasQuery,
    visibleProjects: projects,
    projectRemainder: splitProjects ? projectRemainder : projects,
    recentProjects: splitProjects ? recentProjects : [],
    recentRecordings: splitRecordings ? recentRecordings : [],
    recordingRemainder: splitRecordings ? recordingRemainder : recordings,
    visibleRecordings: recordings,
  };
}
