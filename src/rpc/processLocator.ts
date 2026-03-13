import * as https from 'https';
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
    // 최대 2회 시도 — 첫 번째 실패 시 프로세스를 다시 탐지
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
        const ports = await this.getListeningPorts(processInfo.pid);
        this.log?.(`ProcessLocator: pid=${processInfo.pid} listening ports=[${ports.join(', ') || 'none'}].`);
        for (const port of ports) {
          const isReady = await testPort(port, processInfo.csrfToken);
          this.log?.(`ProcessLocator: heartbeat ${isReady ? 'ok' : 'failed'} for pid=${processInfo.pid} port=${port}.`);
          if (isReady) {
            connections.push({ pid: processInfo.pid, port, csrfToken: processInfo.csrfToken });
            break;
          }
        }
      }

      if (connections.length > 0) {
        this.log?.(`ProcessLocator: resolved ${connections.length} RPC connection(s).`);
        return connections;
      }

      // 포트 탐지 실패 시 잠깐 대기 후 재탐지
      if (attempt < 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return [];
  }

  private async detectProcesses(): Promise<ProcessCandidate[]> {
    if (os.platform() === 'win32') {
      return [];
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

  private async getListeningPorts(pid: number): Promise<number[]> {
    const isDarwin = os.platform() === 'darwin';

    // 1차 시도: -iTCP -sTCP:LISTEN (정확하지만 IPv6 전용 포트는 누락 가능)
    // 2차 fallback: -i (더 넓게 탐색 — IPv6 *:port 형식도 포함)
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

    const portMatch = command.match(/--extension_server_port[=\s]+(\d+)/i);
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
      // lsof: 127.0.0.1:PORT (LISTEN) 형식
      /127\.0\.0\.1:(\d+).*(?:LISTEN|\(LISTEN\))/i,
      // lsof: localhost:PORT (LISTEN) 형식
      /localhost:(\d+).*(?:LISTEN|\(LISTEN\))/i,
      // lsof: *:PORT (LISTEN) 형식 — IPv6 소켓이 IPv4도 수신하는 경우
      /\*:(\d+).*(?:LISTEN|\(LISTEN\))/i,
      // ss: LISTEN NN NN 127.0.0.1:PORT 또는 *:PORT 형식
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
  return /--app_data_dir\s+antigravity\b/i.test(command)
    || command.toLowerCase().includes('/antigravity/')
    || command.toLowerCase().includes('\\antigravity\\');
}

function getProcessNames(): string[] {
  const platform = os.platform();
  const arch = os.arch();
  if (platform === 'darwin') {
    return arch === 'arm64'
      ? ['language_server_macos_arm', 'language_server_macos']
      : ['language_server_macos'];
  }

  if (platform === 'linux') {
    return arch === 'arm64'
      ? ['language_server_linux_arm', 'language_server_linux_x64']
      : ['language_server_linux_x64'];
  }

  return [];
}

async function testPort(port: number, csrfToken: string): Promise<boolean> {
  const requestBody = JSON.stringify({ uuid: '00000000-0000-0000-0000-000000000000' });
  return new Promise((resolve) => {
    const request = https.request({
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
      rejectUnauthorized: false,
      timeout: 2000
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
