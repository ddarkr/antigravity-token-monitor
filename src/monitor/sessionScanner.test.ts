import * as fs from 'fs/promises';
import { mkdtemp, symlink, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { SessionScanner } from './sessionScanner';

describe('SessionScanner', () => {
  it('scans sessions inside standard directory structure', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'scanner-test-'));
    const sessionDir = path.join(root, 'brain', 'session-1');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(path.join(sessionDir, 'cascade.json'), '{"id":"session-1"}');

    const scanner = new SessionScanner();
    const result = await scanner.scan(root);

    expect(result.complete).toBe(true);
    expect(result.sessions.length).toBe(1);
    expect(result.sessions[0].sessionId).toBe('session-1');
  });

  it('handles symlinked sessionRoot without false-positive escaping', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'scanner-symlink-'));
    const realTarget = path.join(base, 'real_storage');
    const symlinkRoot = path.join(base, 'link_storage');

    const sessionDir = path.join(realTarget, 'brain', 'session-symlink');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(path.join(sessionDir, 'cascade.json'), '{"id":"session-symlink"}');

    await symlink(realTarget, symlinkRoot, 'dir');

    const scanner = new SessionScanner();
    const result = await scanner.scan(symlinkRoot);

    expect(result.complete).toBe(true);
    expect(result.sessions.length).toBe(1);
    expect(result.sessions[0].sessionId).toBe('session-symlink');
  });

  it('rejects files escaping sessionRoot via malicious symlink', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'scanner-escape-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'scanner-outside-'));
    await writeFile(path.join(outside, 'secret.json'), '{"secret":true}');

    const sessionDir = path.join(root, 'brain', 'session-malicious');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(path.join(sessionDir, 'normal.json'), '{"ok":true}');

    // Symlink inside pointing to outside directory
    await symlink(path.join(outside, 'secret.json'), path.join(sessionDir, 'escaped.json'), 'file');

    const scanner = new SessionScanner();
    const result = await scanner.scan(root);

    expect(result.complete).toBe(true);
    expect(result.sessions.length).toBe(1);
    // escaped.json must be skipped
    expect(result.sessions[0].filePaths.some((p) => p.endsWith('escaped.json'))).toBe(false);
    expect(result.sessions[0].filePaths.some((p) => p.endsWith('normal.json'))).toBe(true);
  });
});
