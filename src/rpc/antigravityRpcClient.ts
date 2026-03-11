import * as https from 'https';
import { MonitorConfig } from '../config';
import { ProcessLocator, RpcConnectionInfo } from './processLocator';

type TrajectorySummary = {
  sessionId: string;
  lastModifiedMs?: number;
  stepCount?: number;
};

export class AntigravityRpcClient {
  private readonly locator = new ProcessLocator();
  private connectionInfo: RpcConnectionInfo | null = null;

  constructor(private readonly config: MonitorConfig) {}

  async listTrajectories(): Promise<TrajectorySummary[]> {
    const response = await this.request('GetAllCascadeTrajectories', {});
    const rawSummaries = response.trajectorySummaries;
    const items: unknown[] = Array.isArray(rawSummaries)
      ? rawSummaries
      : rawSummaries && typeof rawSummaries === 'object'
        // value를 먼저 spread 후 key(cascadeId)로 덮어써서 Map key가 항상 우선되도록 수정
        ? Object.entries(rawSummaries).map(([key, value]) => ({ ...(value as object), cascadeId: key }))
        : Array.isArray(response.cascadeTrajectories)
          ? response.cascadeTrajectories
          : [];

    return items
      .map((item) => normalizeSummary(item))
      .filter((item): item is TrajectorySummary => item !== null);
  }

  async getTrajectorySteps(sessionId: string): Promise<unknown[]> {
    try {
      const result = await this.request('GetCascadeTrajectory', { cascadeId: sessionId });
      if (Array.isArray(result.trajectory?.steps)) {
        return result.trajectory.steps;
      }
    } catch {
    }

    const fallback = await this.request('GetCascadeTrajectorySteps', {
      cascadeId: sessionId,
      startIndex: 0,
      endIndex: 10000
    });
    return Array.isArray(fallback.steps)
      ? fallback.steps
      : Array.isArray(fallback.step)
        ? fallback.step
        : [];
  }

  async getTrajectoryMetadata(sessionId: string): Promise<unknown[]> {
    try {
      const result = await this.request('GetCascadeTrajectoryGeneratorMetadata', { cascadeId: sessionId });
      if (Array.isArray(result.generatorMetadata)) {
        return result.generatorMetadata;
      }
      return [];
    } catch {
      return [];
    }
  }

  async flush(): Promise<void> {
    try {
      await this.request('SendAllQueuedMessages', {});
    } catch {
    }
  }

  private async request(method: string, body: unknown): Promise<any> {
    const connection = await this.ensureConnection();
    const requestBody = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const request = https.request({
        hostname: '127.0.0.1',
        port: connection.port,
        path: `/exa.language_server_pb.LanguageServerService/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          'Connect-Protocol-Version': '1',
          'X-Codeium-Csrf-Token': connection.csrfToken
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
    // 캐시된 연결이 있으면 재사용, 없으면 새로 탐지
    // Note: 인스턴스는 export 사이클마다 새로 생성되므로 캐싱은 단일 사이클 내 재사용에만 적용됨
    if (!this.connectionInfo) {
      this.connectionInfo = await this.locator.detectConnection();
    }

    if (!this.connectionInfo) {
      throw new Error('Antigravity internal RPC is unavailable.');
    }

    return this.connectionInfo;
  }

  /** 캐시된 연결 정보를 초기화하여 다음 요청 시 재탐지하도록 강제 */
  resetConnection(): void {
    this.connectionInfo = null;
  }
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
