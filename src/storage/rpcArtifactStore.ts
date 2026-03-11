import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { RpcArtifactManifest } from '../types';

type ArtifactPayload = {
  sessionId: string;
  serverLastModifiedMs?: number;
  stepCount?: number;
  steps?: unknown[];
  usage: unknown[];
};

const CACHE_DIR = '.token-monitor';
const CACHE_VERSION = 'v1';

export class RpcArtifactStore {
  constructor(private readonly sessionRoot: string) {}

  async loadManifest(sessionId: string): Promise<RpcArtifactManifest | null> {
    try {
      const raw = await fs.readFile(this.getManifestPath(sessionId), 'utf8');
      return JSON.parse(raw) as RpcArtifactManifest;
    } catch {
      return null;
    }
  }

  async getTokenFilePaths(sessionId: string): Promise<string[]> {
    const candidates = [this.getUsagePath(sessionId), this.getStepsPath(sessionId)];
    const results = await Promise.all(candidates.map(async (filePath) => {
      try {
        const stat = await fs.stat(filePath);
        return stat.isFile() ? filePath : null;
      } catch {
        return null;
      }
    }));

    return results.filter((value): value is string => value !== null);
  }

  async writeSessionArtifacts(payload: ArtifactPayload): Promise<RpcArtifactManifest> {
    const sessionDir = this.getSessionDir(payload.sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    const stepsContent = payload.steps ? toJsonl(payload.steps) : '';
    const usageContent = toJsonl(payload.usage);
    const artifactHash = createHash('sha1')
      .update(payload.sessionId)
      .update('\u0000')
      .update(stepsContent)
      .update('\u0000')
      .update(usageContent)
      .digest('hex');

    if (payload.steps) {
      await writeAtomic(this.getStepsPath(payload.sessionId), stepsContent);
    } else {
      await removeIfExists(this.getStepsPath(payload.sessionId));
    }
    await writeAtomic(this.getUsagePath(payload.sessionId), usageContent);

    const manifest: RpcArtifactManifest = {
      schemaVersion: 1,
      sessionId: payload.sessionId,
      serverLastModifiedMs: payload.serverLastModifiedMs,
      stepCount: payload.stepCount,
      artifactHash,
      exportedAt: Date.now(),
      failureCount: 0
    };

    await writeAtomic(this.getManifestPath(payload.sessionId), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  }

  async recordFailure(sessionId: string, error: unknown): Promise<void> {
    const previous = await this.loadManifest(sessionId);
    const next: RpcArtifactManifest = {
      schemaVersion: 1,
      sessionId,
      serverLastModifiedMs: previous?.serverLastModifiedMs,
      stepCount: previous?.stepCount,
      artifactHash: previous?.artifactHash ?? '',
      exportedAt: previous?.exportedAt ?? 0,
      failureCount: (previous?.failureCount ?? 0) + 1,
      lastError: error instanceof Error ? error.message : String(error)
    };

    await fs.mkdir(this.getSessionDir(sessionId), { recursive: true });
    await writeAtomic(this.getManifestPath(sessionId), `${JSON.stringify(next, null, 2)}\n`);
  }

  async clearAll(): Promise<number> {
    const cacheRoot = this.getCacheRoot();
    let count = 0;
    try {
      const entries = await fs.readdir(cacheRoot, { withFileTypes: true });
      count = entries.filter((e) => e.isDirectory()).length;
      await fs.rm(cacheRoot, { recursive: true, force: true });
    } catch {
      // 캐시 폴더가 없으면 무시
    }
    return count;
  }

  private getCacheRoot(): string {
    return path.join(this.sessionRoot, CACHE_DIR, 'rpc-cache', CACHE_VERSION);
  }

  private getSessionDir(sessionId: string): string {
    return path.join(this.getCacheRoot(), sessionId);
  }

  private getManifestPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'manifest.json');
  }

  private getStepsPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'steps.jsonl');
  }

  private getUsagePath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'usage.jsonl');
  }
}

function toJsonl(records: unknown[]): string {
  if (records.length === 0) {
    return '';
  }

  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, filePath);
}

async function removeIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
  }
}
