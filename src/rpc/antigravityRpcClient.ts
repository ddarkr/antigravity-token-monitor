import * as https from 'https';
import { MonitorConfig } from '../config';
import { ProcessLocator, RpcConnectionInfo } from './processLocator';

type TrajectorySummary = {
  sessionId: string;
  lastModifiedMs?: number;
  stepCount?: number;
};

export class AntigravityRpcClient {
  private readonly locator: ProcessLocator;
  private connectionInfo: RpcConnectionInfo | null = null;
  private connections: RpcConnectionInfo[] | null = null;
  private readonly sessionConnections = new Map<string, RpcConnectionInfo>();

  constructor(
    private readonly config: MonitorConfig,
    private readonly log?: (message: string) => void
  ) {
    this.locator = new ProcessLocator(log);
  }

  async listTrajectories(): Promise<TrajectorySummary[]> {
    const connections = await this.ensureConnections();
    const merged = new Map<string, { summary: TrajectorySummary; connection: RpcConnectionInfo }>();

    for (const connection of connections) {
      const response = await this.request('GetAllCascadeTrajectories', {}, connection);
      const rawSummaries = response.trajectorySummaries;
      const items: unknown[] = Array.isArray(rawSummaries)
        ? rawSummaries
        : rawSummaries && typeof rawSummaries === 'object'
          ? Object.entries(rawSummaries).map(([key, value]) => ({ ...(value as object), cascadeId: key }))
          : Array.isArray(response.cascadeTrajectories)
            ? response.cascadeTrajectories
            : [];

      const summaries = items
        .map((item) => normalizeSummary(item))
        .filter((item): item is TrajectorySummary => item !== null);

      this.log?.(`AntigravityRpcClient: pid=${connection.pid} port=${connection.port} listTrajectories returned ${summaries.length} item(s).`);

      for (const summary of summaries) {
        const existing = merged.get(summary.sessionId);
        if (!existing || isBetterSummary(summary, existing.summary)) {
          merged.set(summary.sessionId, { summary, connection });
        }
      }
    }

    this.sessionConnections.clear();
    for (const [sessionId, value] of merged.entries()) {
      this.sessionConnections.set(sessionId, value.connection);
    }

    const summaries = [...merged.values()].map((value) => value.summary);
    this.log?.(`AntigravityRpcClient: merged trajectory list returned ${summaries.length} unique item(s) across ${connections.length} connection(s).`);
    return summaries;
  }

  async getTrajectorySteps(sessionId: string): Promise<unknown[]> {
    for (const connection of await this.getConnectionsForSession(sessionId)) {
      try {
        const result = await this.request('GetCascadeTrajectory', { cascadeId: sessionId }, connection);
        if (Array.isArray(result.trajectory?.steps)) {
          return result.trajectory.steps;
        }
      } catch {
      }

      try {
        const fallback = await this.request('GetCascadeTrajectorySteps', {
          cascadeId: sessionId,
          startIndex: 0,
          endIndex: 10000
        }, connection);
        return Array.isArray(fallback.steps)
          ? fallback.steps
          : Array.isArray(fallback.step)
            ? fallback.step
            : [];
      } catch {
      }
    }

    return [];
  }

  async getTrajectoryMetadata(sessionId: string): Promise<unknown[]> {
    for (const connection of await this.getConnectionsForSession(sessionId)) {
      try {
        const result = await this.request('GetCascadeTrajectoryGeneratorMetadata', { cascadeId: sessionId }, connection);
        if (Array.isArray(result.generatorMetadata)) {
          this.log?.(`AntigravityRpcClient: pid=${connection.pid} metadata for ${sessionId} returned ${result.generatorMetadata.length} row(s).`);
          return result.generatorMetadata;
        }
        this.log?.(`AntigravityRpcClient: pid=${connection.pid} metadata for ${sessionId} returned non-array payload.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log?.(`AntigravityRpcClient: pid=${connection.pid} metadata fetch failed for ${sessionId}: ${message}`);
      }
    }

    return [];
  }

  async flush(): Promise<void> {
    for (const connection of await this.ensureConnections()) {
      try {
        await this.request('SendAllQueuedMessages', {}, connection);
      } catch {
      }
    }
  }

  private async request(method: string, body: unknown, connection?: RpcConnectionInfo): Promise<any> {
    const resolvedConnection = connection ?? await this.ensureConnection();
    const requestBody = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const request = https.request({
        hostname: '127.0.0.1',
        port: resolvedConnection.port,
        path: `/exa.language_server_pb.LanguageServerService/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          'Connect-Protocol-Version': '1',
          'X-Codeium-Csrf-Token': resolvedConnection.csrfToken
        },
        rejectUnauthorized: false,
        timeout: this.config.rpcTimeoutMs
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (response.statusCode !== 200) {
            reject(new Error(`RPC ${method} failed with status ${response.statusCode}: ${raw}`));
            return;
          }

          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch (error) {
            reject(error);
          }
        });
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy(new Error(`RPC ${method} timed out`));
      });
      request.write(requestBody);
      request.end();
    });
  }

  private async ensureConnection(): Promise<RpcConnectionInfo> {
    const connections = await this.ensureConnections();
    const firstConnection = connections[0] ?? null;
    if (!firstConnection) {
      throw new Error('Antigravity internal RPC is unavailable.');
    }

    this.connectionInfo = firstConnection;
    return firstConnection;
  }

  private async ensureConnections(): Promise<RpcConnectionInfo[]> {
    if (!this.connections) {
      this.connections = await this.locator.detectConnections();
      if (this.connections.length > 0) {
        this.connectionInfo = this.connections[0];
        this.log?.(`AntigravityRpcClient: connected to ${this.connections.length} RPC connection(s): ${this.connections.map((connection) => `pid=${connection.pid}:port=${connection.port}`).join(', ')}.`);
      }
    }

    return this.connections;
  }

  private async getConnectionsForSession(sessionId: string): Promise<RpcConnectionInfo[]> {
    const connections = await this.ensureConnections();
    const preferred = this.sessionConnections.get(sessionId);
    if (!preferred) {
      return connections;
    }

    return [preferred, ...connections.filter((connection) => connection.pid !== preferred.pid || connection.port !== preferred.port)];
  }

  /** 캐시된 연결 정보를 초기화하여 다음 요청 시 재탐지하도록 강제 */
  resetConnection(): void {
    this.connectionInfo = null;
    this.connections = null;
    this.sessionConnections.clear();
  }
}

function isBetterSummary(next: TrajectorySummary, current: TrajectorySummary): boolean {
  const nextModified = next.lastModifiedMs ?? 0;
  const currentModified = current.lastModifiedMs ?? 0;
  if (nextModified !== currentModified) {
    return nextModified > currentModified;
  }

  return (next.stepCount ?? 0) > (current.stepCount ?? 0);
}

function normalizeSummary(input: unknown): TrajectorySummary | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const record = input as Record<string, unknown>;

  // cascadeId > trajectoryId > id > sessionId 순으로 탐색
  const sessionId = firstString(
    record.cascadeId,
    record.trajectoryId,
    record.id,
    record.sessionId
  );
  if (!sessionId) {
    return null;
  }

  return {
    sessionId,
    // lastModifiedTime이 문자열(ISO 8601)로 올 수 있으므로 parseTimestamp에서 처리
    lastModifiedMs: parseTimestamp(
      record.lastModifiedTime,
      record.lastModified,
      record.updatedAt,
      record.modifiedAt
    ),
    stepCount: firstNumber(record.stepCount, record.numSteps, record.totalSteps)
  };
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function parseTimestamp(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}
