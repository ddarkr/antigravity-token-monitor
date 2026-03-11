import * as fs from 'fs/promises';
import * as path from 'path';

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

type LockPayload = {
  pid: number;
  acquiredAt: number;
};

export class PollLock {
  private held = false;

  private constructor(private readonly lockPath: string) {}

  static forRefresh(sessionRoot: string): PollLock {
    return new PollLock(path.join(sessionRoot, '.token-monitor', 'refresh.lock'));
  }

  static forExport(sessionRoot: string): PollLock {
    return new PollLock(path.join(sessionRoot, '.token-monitor', 'export.lock'));
  }

  async tryAcquire(): Promise<boolean> {
    try {
      await fs.mkdir(path.dirname(this.lockPath), { recursive: true });
      const handle = await fs.open(this.lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }));
      await handle.close();
      this.held = true;
      return true;
    } catch {
      return this.tryRecoverStale();
    }
  }

  async release(): Promise<void> {
    if (!this.held) {
      return;
    }

    try {
      await fs.unlink(this.lockPath);
    } catch {}
    this.held = false;
  }

  private async tryRecoverStale(): Promise<boolean> {
    try {
      const raw = await fs.readFile(this.lockPath, 'utf8');
      const payload = JSON.parse(raw) as LockPayload;
      if (Date.now() - payload.acquiredAt > STALE_THRESHOLD_MS || !isProcessAlive(payload.pid)) {
        try {
          await fs.unlink(this.lockPath);
        } catch {}
        return this.tryAcquire();
      }
    } catch {}
    return false;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
