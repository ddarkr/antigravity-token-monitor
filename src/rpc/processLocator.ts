import * as http from 'http';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type RpcConnectionInfo = {
  pid: number;
  port: number;
  csrfToken: string;
};

type ProcessCandidate = {
  pid: number;
  ppid: number;
  extensionPort: number;
  csrfToken: string;
};

export class ProcessLocator {
  constructor(private readonly log?: (message: string) => void) {}

  async detectConnection(): Promise<RpcConnectionInfo | null> {
    const connections = await this.detectConnections();
    return connections[0] ?? null;
  }

  async detectConnections(): Promise<RpcConnectionInfo[]> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const processInfos = await this.detectProcesses();
      if (processInfos.length === 0) {
        this.log?.(`ProcessLocator: no Antigravity process detected (attempt ${attempt + 1}/2).`);
        return [];
      }

      const connections: RpcConnectionInfo[] = [];
      for (const processInfo of processInfos) {
        this.log?.(
          `ProcessLocator: selected pid=${processInfo.pid} ppid=${processInfo.ppid} declaredPort=${processInfo.extensionPort || 'unknown'} (attempt ${attempt + 1}/2).`
        );
        const declaredPort = processInfo.extensionPort > 0 ? [processInfo.extensionPort] : [];
        const listeningPorts = await this.getListeningPorts(processInfo.pid);
        const candidatePorts = [...new Set([...declaredPort, ...listeningPorts])];
        this.log?.(`ProcessLocator: pid=${processInfo.pid} candidate ports=[${candidatePorts.join(', ') || 'none'}].`);
        for (const port of candidatePorts) {
          const isReady = await testPort(port, processInfo.csrfToken);
          this.log?.(`ProcessLocator: heartbeat ${isReady ? 'ok' : 'failed'} for pid=${processInfo.pid} port=${port}.`);
          if (isReady) {
            connections.push({
              pid: processInfo.pid,
              port,
              csrfToken: processInfo.csrfToken
            });
            break;
          }
        }
      }

      if (connections.length > 0) {
        this.log?.(`ProcessLocator: resolved ${connections.length} RPC connection(s).`);
        return connections;
      }

      if (attempt < 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return [];
  }

  private async detectProcesses(): Promise<ProcessCandidate[]> {
    if (os.platform() === 'win32') {
      return this.detectProcessesWindows();
    }

    const allCandidates: ProcessCandidate[] = [];
    const processNames = getProcessNames();
    for (const processName of processNames) {
      const stdout = await runCommand(`ps -ww -eo pid,ppid,args | grep "${processName}" | grep -v grep | grep -v graftcp`);
      const candidates = parseProcessInfoCandidates(stdout);
      if (candidates.length > 0) {
        this.log?.(`ProcessLocator: found ${candidates.length} candidate process(es) for ${processName}; pids=[${candidates.map((candidate) => candidate.pid).join(', ')}].`);
      }
      allCandidates.push(...candidates);
    }

    return dedupeProcesses(allCandidates);
  }

  private async detectProcessesWindows(): Promise<ProcessCandidate[]> {
    const psScript = `Get-CimInstance Win32_Process -Filter "Name like '%agy%'" | Select-Object ProcessId, ParentProcessId, CommandLine | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.CommandLine)" }`;
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    const stdout = await runCommand(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`);
    const candidates = parseProcessInfoCandidates(stdout);
    if (candidates.length > 0) {
      this.log?.(`ProcessLocator: (Win32) found ${candidates.length} candidate process(es); pids=[${candidates.map(c => c.pid).join(', ')}].`);
    }
    return dedupeProcesses(candidates);
  }

  private async getListeningPorts(pid: number): Promise<number[]> {
    const isDarwin = os.platform() === 'darwin';

    if (os.platform() === 'win32') {
      const stdout = await runCommand(`netstat -ano -p tcp`);
      const ports = new Set<number>();
      for (const line of stdout.split('\n')) {
        if (line.includes('LISTENING') && line.trim().endsWith(String(pid))) {
          const match = line.match(/(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]):(\d+)/);
          if (match?.[1]) {
            const p = Number.parseInt(match[1], 10);
            if (p > 0) ports.add(p);
          }
        }
      }
      return [...ports].sort((a, b) => a - b);
    }

    const attempts = isDarwin
      ? [
          `lsof -Pan -p ${pid} -iTCP -sTCP:LISTEN`,
          `lsof -Pan -p ${pid} -i`
        ]
      : [
          `lsof -Pan -p ${pid} -iTCP -sTCP:LISTEN`,
          `ss -tlnp 2>/dev/null | grep "pid=${pid},"`,
          `netstat -tulpn 2>/dev/null | grep ${pid}`
        ];

    const ports = new Set<number>();
    for (const command of attempts) {
      const stdout = await runCommand(command);
      for (const port of parsePorts(stdout)) {
        ports.add(port);
      }
      if (ports.size > 0) {
        break;
      }
    }

    return [...ports].sort((a, b) => a - b);
  }
}

async function runCommand(command: string): Promise<string> {
  try {
    const result = await execAsync(command, { timeout: 3000 });
    return result.stdout;
  } catch {
    return '';
  }
}

function parseProcessInfoCandidates(stdout: string): ProcessCandidate[] {
  if (!stdout.trim()) {
    return [];
  }

  const candidates: ProcessCandidate[] = [];
  for (const line of stdout.trim().split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) {
      continue;
    }

    const pid = Number.parseInt(parts[0], 10);
    const ppid = Number.parseInt(parts[1], 10);
    const command = parts.slice(2).join(' ');
    if (!Number.isFinite(pid) || !Number.isFinite(ppid)) {
      continue;
    }

    if (!isAntigravityProcess(command)) {
      continue;
    }

    const portMatch = command.match(/--(?:hub[-_]port|extension_server_port)[=\s]+(\d+)/i);
    const tokenMatch = command.match(/--csrf_token[=\s]+([a-f0-9-]+)/i);
    if (!tokenMatch?.[1]) {
      continue;
    }

    candidates.push({
      pid,
      ppid,
      extensionPort: portMatch?.[1] ? Number.parseInt(portMatch[1], 10) : 0,
      csrfToken: tokenMatch[1]
    });
  }

  return candidates;
}

function dedupeProcesses(candidates: ProcessCandidate[]): ProcessCandidate[] {
  const byPid = new Map<number, ProcessCandidate>();
  for (const candidate of candidates) {
    byPid.set(candidate.pid, candidate);
  }
  return [...byPid.values()].sort((left, right) => right.pid - left.pid);
}

function parsePorts(stdout: string): number[] {
  const ports = new Set<number>();
  for (const line of stdout.trim().split('\n')) {
    for (const pattern of [
      /127\.0\.0\.1:(\d+).*(?:LISTEN|\(LISTEN\))/i,
      /localhost:(\d+).*(?:LISTEN|\(LISTEN\))/i,
      /\*:(\d+).*(?:LISTEN|\(LISTEN\))/i,
      /LISTEN\s+\d+\s+\d+\s+(?:127\.0\.0\.1|\*|::1|::):(\d+)/i
    ]) {
      const match = line.match(pattern);
      if (match?.[1]) {
        const port = Number.parseInt(match[1], 10);
        if (Number.isFinite(port) && port > 0) {
          ports.add(port);
        }
      }
    }
  }

  return [...ports];
}

function isAntigravityProcess(command: string): boolean {
  const lower = command.toLowerCase();
  if (lower.includes('powershell') || lower.includes('wmic') || lower.includes('cmd.exe')) {
    return false;
  }
  return lower.includes('agy') || /--app_data_dir[=\s]+antigravity\b/i.test(command);
}

function getProcessNames(): string[] {
  const platform = os.platform();
  if (platform === 'win32') {
    return ['agy.exe', 'agy'];
  }
  return ['agy'];
}

async function testPort(port: number, csrfToken: string): Promise<boolean> {
  const requestBody = JSON.stringify({ uuid: '00000000-0000-0000-0000-000000000000' });
  return new Promise((resolve) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/exa.language_server_pb.LanguageServerService/Heartbeat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'Connect-Protocol-Version': '1',
        'X-Codeium-Csrf-Token': csrfToken
      },
      timeout: 1500
    }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.write(requestBody);
    request.end();
  });
}
