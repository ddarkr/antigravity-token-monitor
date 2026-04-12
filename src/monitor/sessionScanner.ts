import * as fs from 'fs/promises';
import type { Dirent, Stats } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { SessionScanCandidate, SessionScanResult } from '../types';


const EXCLUDED_NAMES = new Set(['.ds_store', 'thumbs.db']);
const TEXT_EXTENSIONS = new Set(['.json', '.jsonl', '.md', '.txt', '.log', '.yaml', '.yml']);

export class SessionScanner {
  async scan(sessionRoot: string): Promise<SessionScanResult> {
    const brainDir = path.join(sessionRoot, 'brain');
    const conversationsDir = path.join(sessionRoot, 'conversations');

    const dirEntries = await safeReadDir(brainDir);
    if (!dirEntries.ok) {
      return { sessions: [], complete: false, error: dirEntries.error ?? `Failed to read ${brainDir}` };
    }

    const sessions: SessionScanCandidate[] = [];

    for (const entry of dirEntries.entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const sessionId = entry.name;
      const sessionDir = path.join(brainDir, sessionId);
      const collected = await collectFiles(sessionDir, sessionRoot);
      if (!collected.ok) {
        return { sessions: [], complete: false, error: collected.error ?? `Failed to read ${sessionDir}` };
      }

      // Only include files with parseable text extensions
      const filePaths = collected.files.filter((f) => TEXT_EXTENSIONS.has(path.extname(f).toLowerCase()));
      if (filePaths.length === 0) {
        continue;
      }
      const pbPath = path.join(conversationsDir, `${sessionId}.pb`);
      const pbStat = await safeStat(pbPath);
      if (pbStat) {
        filePaths.push(pbPath);
      }

      let lastModifiedMs = 0;
      const signatureParts: string[] = [];
      for (const filePath of filePaths) {
        const stat = await safeStat(filePath);
        if (!stat) {
          continue;
        }

        const mtimeMs = Number(stat.mtimeMs);
        const size = Number(stat.size);
        lastModifiedMs = Math.max(lastModifiedMs, mtimeMs);
        signatureParts.push(`${filePath}:${size}:${Math.round(mtimeMs)}`);
      }

      if (signatureParts.length === 0) {
        continue;
      }

      sessions.push({
        sessionId,
        sessionDir,
        pbPath: pbStat ? pbPath : undefined,
        filePaths: filePaths.sort(),
        labelHint: sessionId,
        lastModifiedMs,
        signature: createHash('sha1').update(signatureParts.join('|')).digest('hex')
      });
    }

    sessions.sort((a, b) => b.lastModifiedMs - a.lastModifiedMs);
    return { sessions, complete: true };
  }
}

async function collectFiles(dirPath: string, sessionRoot: string): Promise<{ ok: true; files: string[] } | { ok: false; error?: string }> {
  const files: string[] = [];
  const entries = await safeReadDir(dirPath);
  if (!entries.ok) {
    return { ok: false, error: entries.error };
  }

  for (const entry of entries.entries) {
    if (EXCLUDED_NAMES.has(entry.name.toLowerCase()) || entry.name.endsWith('~')) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      // Security: validate symlink doesn't escape sessionRoot
      try {
        const realPath = await fs.realpath(fullPath);
        if (!realPath.startsWith(sessionRoot)) {
          console.warn(`[Scanner] Symlink escapes sessionRoot: ${fullPath} -> ${realPath}`);
          continue;
        }
      } catch {}

      const nested = await collectFiles(fullPath, sessionRoot);
      if (!nested.ok) {
        return nested;
      }

      files.push(...nested.files);
      continue;
    }

    // Security: validate symlink doesn't escape sessionRoot for files too
    try {
      const realPath = await fs.realpath(fullPath);
      if (!realPath.startsWith(sessionRoot)) {
        console.warn(`[Scanner] Symlink escapes sessionRoot: ${fullPath} -> ${realPath}`);
        continue;
      }
    } catch {}

    files.push(fullPath);
  }

  return { ok: true, files };
}

async function safeReadDir(dirPath: string): Promise<{ ok: true; entries: Dirent[] } | { ok: false; error?: string }> {
  try {
    return { ok: true, entries: await fs.readdir(dirPath, { withFileTypes: true }) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : undefined };
  }
}

async function safeStat(filePath: string): Promise<Stats | null> {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}
