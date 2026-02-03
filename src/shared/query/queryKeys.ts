export const queryKeys = {
  me: () => ["me"] as const,
  personalizationPrefs: (userId: string) => ["personalizationPrefs", userId] as const,
  paths: () => ["paths"] as const,
  path: (id: string) => ["paths", id] as const,
  pathNodes: (pathId: string) => ["pathNodes", pathId] as const,
  pathRuntime: (pathId: string) => ["pathRuntime", pathId] as const,
  conceptGraph: (pathId: string) => ["conceptGraph", pathId] as const,
  materialFiles: () => ["materialFiles"] as const,
  chatThreads: ({
    pathId = null,
    limit = null,
  }: {
    pathId?: string | null;
    limit?: number | null;
  } = {}) => ["chatThreads", { pathId, limit }] as const,
  libraryTaxonomySnapshot: () => ["libraryTaxonomySnapshot"] as const,
} as const;
