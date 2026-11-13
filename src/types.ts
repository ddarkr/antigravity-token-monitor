export type TokenBreakdown = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export type ModelTokenBreakdown = TokenBreakdown;

export type TokenMode = 'reported' | 'estimated';

export type TokenSource = 'filesystem' | 'rpc-artifact';

export type ActivityCategory =
  | 'file_read'
  | 'search'
  | 'file_edit'
  | 'command'
  | 'agent'
  | 'thinking_response'
  | 'other';

export type SessionActivityBreakdown = {
  category: ActivityCategory;
  label: string;
  stepCount: number;
  callCount: number;
  totalTokens: number;
  costUsd?: number;
  tools: Record<string, number>;
  modelTotals?: Record<string, number>;
};

export type SessionModelCost = {
  costUsd?: number;
  cacheSavedUsd?: number;
  cacheHitRate?: number;
  pricingStatus: 'priced' | 'unpriced';
  pricingNote?: string;
};

export type SessionScanCandidate = {
  sessionId: string;
  sessionDir: string;
  pbPath?: string;
  filePaths: string[];
  labelHint: string;
  lastModifiedMs: number;
  signature: string;
};

export type RpcArtifactManifest = {
  schemaVersion: number;
  sessionId: string;
  serverLastModifiedMs?: number;
  stepCount?: number;
  artifactHash: string;
  exportedAt: number;
  failureCount: number;
  lastError?: string;
};

export type SessionParsePlan = {
  sessionId: string;
  sessionDir: string;
  labelHint: string;
  lastModifiedMs: number;
  tokenFilePaths: string[];
  analysisSignature: string;
  source: TokenSource;
};

export type SessionScanResult = {
  sessions: SessionScanCandidate[];
  complete: boolean;
  error?: string;
};

export type SessionTotals = TokenBreakdown & {
  sessionId: string;
  label: string;
  filePath: string;
  lastModifiedMs: number;
  mode: TokenMode;
  source: TokenSource;
  evidenceCount: number;
  messageCount?: number;
  modelTotals?: Record<string, number>;
  modelBreakdowns?: Record<string, ModelTokenBreakdown>;
  activityBreakdown?: SessionActivityBreakdown[];
};

export type SessionSnapshot = TokenBreakdown & {
  capturedAt: number;
  mode: TokenMode;
};

export type SessionLifecycleStatus = 'active' | 'archived';

export type SessionLifecycle = {
  status: SessionLifecycleStatus;
  lastSeenAt: number;
  archivedAt?: number;
};

export type PersistedSessionState = {
  signature: string;
  latest: SessionTotals;
  snapshots: SessionSnapshot[];
  lifecycle: SessionLifecycle;
};

export type PersistedState = {
  lastPollAt?: number;
  sessions: Record<string, PersistedSessionState>;
};

export type DashboardSession = {
  sessionId: string;
  label: string;
  filePath: string;
  lastModifiedMs: number;
  status: SessionLifecycleStatus;
  lastSeenAt: number;
  archivedAt?: number;
  mode: TokenMode;
  source: TokenSource;
  messageCount: number;
  latest: TokenBreakdown;
  latestDelta: TokenBreakdown;
  recentTotals: number[];
  snapshotCount: number;
  modelTotals?: Record<string, number>;
  modelBreakdowns?: Record<string, ModelTokenBreakdown>;
  costUsd?: number;
  cacheSavedUsd?: number;
  cacheHitRate?: number;
  pricingStatus?: 'priced' | 'partial' | 'unpriced';
  modelCosts?: Record<string, SessionModelCost>;
  activityBreakdown?: SessionActivityBreakdown[];
};

export type ActivityHeatmapBin = {
  date: string;
  totalTokens: number;
  sessionCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costUsd: number;
  messageCount: number;
};

export type SourceBreakdown = {
  source: TokenSource;
  sessionCount: number;
  changedSessionCount: number;
  totalTokens: number;
};

export type ModeBreakdown = {
  mode: TokenMode;
  sessionCount: number;
  changedSessionCount: number;
  totalTokens: number;
};

export type ModelUsageBreakdown = {
  model: string;
  totalTokens: number;
  sessionCount: number;
  costUsd?: number;
  cacheSavedUsd?: number;
  cacheHitRate?: number;
  breakdown?: ModelTokenBreakdown;
  pricingStatus: 'priced' | 'unpriced';
  pricingNote?: string;
};

export type DashboardPricingSummary = {
  status: 'ready' | 'partial' | 'unavailable' | 'error';
  totalCostUsd: number;
  totalCacheSavedUsd?: number;
  pricedModelCount: number;
  unpricedModelCount: number;
  missingModels: string[];
  lastUpdatedAt?: number;
  message: string;
};

export type RpcCoverageBreakdown = {
  trackedSessions: number;
  exportedSessions: number;
  skippedSessions: number;
  changedSessions: number;
};

export type DashboardAnalytics = {
  activityHeatmap: ActivityHeatmapBin[];
  sourceBreakdown: SourceBreakdown[];
  modeBreakdown: ModeBreakdown[];
  modelUsage: ModelUsageBreakdown[];
  rpcCoverage: RpcCoverageBreakdown;
};

export type DashboardState = {
  rootPath: string;
  config: {
    useRpcExport: boolean;
    exportStepsJsonl: boolean;
    pollIntervalMs: number;
  };
  lastPollAt?: number;
  syncStatus: 'idle' | 'running' | 'error';
  syncMessage: string;
  exportStatus: {
    status: 'idle' | 'running' | 'error';
    message: string;
    lastExportAt?: number;
    lastExportedCount: number;
  };
  sessions: DashboardSession[];
  summary: {
    sessionCount: number;
    activeSessionCount: number;
    archivedSessionCount: number;
    messageCount: number;
    changedSessionCount: number;
    totalTokens: number;
    estimatedSessionCount: number;
  };
  pricing: DashboardPricingSummary;
  analytics: DashboardAnalytics;
};

export type WebviewToExtensionMessage =
  | { type: 'dashboard/ready' }
  | { type: 'dashboard/refresh' };

export type ExtensionToWebviewMessage =
  | { type: 'dashboard/state'; payload: DashboardState }
  | { type: 'dashboard/selectSession'; sessionId: string }
  | { type: 'dashboard/error'; message: string };

export type SidebarToExtensionMessage =
  | { type: 'sidebar/ready' }
  | { type: 'sidebar/refresh' }
  | { type: 'sidebar/openDashboard' }
  | { type: 'sidebar/openSession'; sessionId: string };

export type ExtensionToSidebarMessage =
  | { type: 'sidebar/state'; payload: DashboardState }
  | { type: 'sidebar/error'; message: string };
