# Antigravity Token Monitor — Architecture

## Overview

Antigravity Token Monitor는 VS Code 익스텐션으로, **Antigravity 세션의 토큰 사용량**을 자동 수집·분석하여
대시보드와 상태바에 시각화합니다.

| 항목        | 내용                                                         |
| ----------- | ------------------------------------------------------------ |
| 타입        | VS Code Extension                                            |
| 기술 스택   | TypeScript, Svelte 5, esbuild                                |
| UI          | VS Code Webview (Svelte SPA) + StatusBar                     |
| 데이터 소스 | Antigravity 내부 RPC + 파일시스템 (`~/.gemini/antigravity/`) |

---

## Data Pipeline

토큰 정보가 수집부터 사용자에게 표시되기까지의 전체 흐름:

```
ProcessLocator          Antigravity language_server 프로세스 탐지
       │                (ps → port/csrfToken 추출 → lsof → Heartbeat 검증)
       ▼
AntigravityRpcClient    HTTPS RPC 통신 (localhost)
       │                GetCascadeTrajectoryGeneratorMetadata → 토큰 메타데이터
       │                연결 에러 시 resetConnection()으로 캐시 초기화 → 재탐지
       ▼
TrajectoryExporter      메타데이터를 usage.jsonl로 직렬화 → 로컬 저장
       │                (.token-monitor/rpc-cache/v1/{sessionId}/)
       │                ⚡ RPC 목록에 없는 세션도 파일시스템 ID 기반 직접 조회 (Fallback)
       ▼
modelAliases            MODEL_PLACEHOLDER_* → 실제 모델명 해석
       ▼
SessionScanner          파일시스템 스캔 (~/.gemini/antigravity/brain/)
       │                세션 디렉토리 열거 + 변경 감지 (SHA-1 시그니처)
       ▼
sourceResolver          데이터 소스 결정 (rpc-artifact vs filesystem)
       ▼
AntigravitySessionParser  토큰 파싱
       │                  Reported: 구조화된 usage 레코드에서 정확한 수치 추출
       │                  Estimated: 텍스트 길이 기반 추정 (length/4)
       │                  모델 플레이스홀더 해석: modelAliases 활용
       ▼
SessionUsageCalculator  스냅샷 델타 계산 (이전 대비 증감)
       ▼
PollLock                파일 기반 락 (다중 VS Code 인스턴스 중복 방지)
       ▼
TokenMonitorService     중앙 오케스트레이터
       │                세션별·모델별·일별 집계 + LiteLLM 비용 산정
       │                80% 쿨다운 체크로 과도한 재폴링 방지
       ├───▶ TokenStatusBar     VS Code 하단 상태바 (총 토큰 수)
       └───▶ DashboardPanel     Svelte Webview (대시보드 + 리프레시 카운트다운)
```

---

## Module Structure

### Data Acquisition

#### `rpc/processLocator.ts`

Antigravity `language_server` 프로세스를 OS 명령어로 탐지합니다.

- `ps -ww -eo pid,ppid,args`로 프로세스 검색
- 인수에서 `--csrf_token`, `--extension_server_port` 파싱
- `lsof -Pan -p {pid} -iTCP -sTCP:LISTEN`으로 리스닝 포트 감지
- HTTPS Heartbeat(`/exa.language_server_pb.LanguageServerService/Heartbeat`)로 포트 검증
- macOS(arm64/x64), Linux 지원. Windows 미지원.

#### `rpc/antigravityRpcClient.ts`

Antigravity 내부 RPC 서버와 HTTPS 통신합니다.

- Connect Protocol (`Connect-Protocol-Version: 1`)
- `127.0.0.1:{port}` + 자체 서명 인증서 (`rejectUnauthorized: false`)
- 연결 에러 시 `resetConnection()`으로 캐시된 연결 정보를 초기화하여 다음 요청에서 재탐지
- 주요 RPC 메서드:

| 메서드                                  | 용도                             |
| --------------------------------------- | -------------------------------- |
| `GetAllCascadeTrajectories`             | 모든 세션 요약 목록              |
| `GetCascadeTrajectory`                  | 특정 세션 전체 스텝              |
| `GetCascadeTrajectorySteps`             | 특정 세션 스텝 (인덱스 범위)     |
| `GetCascadeTrajectoryGeneratorMetadata` | 세션 토큰 사용량 메타데이터      |
| `SendAllQueuedMessages`                 | 대기 메시지 플러시 (best-effort) |

#### `rpc/trajectoryExporter.ts`

RPC로 수집한 데이터를 로컬 JSONL 아티팩트로 직렬화합니다.

- **`usage.jsonl`**: `recordType: 'usage'` 레코드. 모델명, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, raw 데이터 포함.
- **`steps.jsonl`** (선택, `exportStepsJsonl: true`): `recordType: 'step'` 레코드. 대화 스텝 기록.
- 변경 감지: `serverLastModifiedMs` + `stepCount` 비교로 변경된 세션만 재내보내기.
- **히스토리 세션 복구 (Fallback)**: `GetAllCascadeTrajectories` 응답에 포함되지 않은 세션은 파일시스템에서 감지된 세션 ID를 기반으로 직접 RPC 조회를 시도합니다. 이를 통해 익스텐션 실행 이전에 생성된 과거 세션 데이터도 복구할 수 있습니다.
- 모델명 추출 시 `responseModel` 필드를 우선, 플레이스홀더인 경우 `modelAliases`를 통해 실제 이름으로 해석.

#### `modelAliases.ts`

Antigravity RPC 서버가 사용하는 내부 모델 플레이스홀더 ID를 사람이 읽을 수 있는 이름으로 매핑합니다.

- `MODEL_PLACEHOLDER_M37` → `gemini-3.1-pro-high`, `MODEL_PLACEHOLDER_M18` → `gemini-3-flash` 등
- `MODEL_CLAUDE_4_5_SONNET` 같은 비-플레이스홀더 내부 ID도 매핑 포함
- 최신 API 응답에 `responseModel` 필드가 있으면 그것이 우선; 없을 때 이 맵이 폴백으로 동작

---

### Data Analysis

#### `monitor/sessionScanner.ts`

`~/.gemini/antigravity/brain/` 하위 세션 디렉토리를 순회합니다.

- 각 세션의 파일 경로, 크기, 수정 시간 수집
- SHA-1 시그니처 생성 → 변경 감지에 활용
- `.pb` 파일도 `conversations/` 디렉토리에서 탐색

#### `monitor/sourceResolver.ts`

데이터 소스를 결정합니다.

- RPC 아티팩트가 존재하면 `source: 'rpc-artifact'`
- 없으면 `source: 'filesystem'` (현재 구현에서는 filesystem-only 세션은 건너뜀)

#### `parser/antigravitySessionParser.ts`

토큰 파싱의 핵심 모듈입니다. 두 가지 모드로 동작:

**Reported 모드** (구조화된 데이터 존재 시):

- `usage.jsonl`에서 `recordType: 'usage'` 레코드 탐색
- `raw.chatModel.usage` 등 중첩 구조를 재귀 탐색하여 토큰 값 추출
- 모델별 분류: `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`
- 모델 플레이스홀더(`MODEL_PLACEHOLDER_*`) 해석: `responseModel` 우선 → `modelAliases` 폴백

**Estimated 모드** (폴백):

- 구조화된 신호 없을 시 텍스트 길이 기반 추정: `Math.round(text.length / 4)`
- 추정 토큰을 62:38 비율로 input/output에 배분

**라벨 추출**: `task.md`, `implementation_plan.md`, `walkthrough.md`에서 `# Task: ...` 형식 제목 파싱.

#### `monitor/sessionUsageCalculator.ts`

이전 스냅샷 대비 토큰 증감(delta)을 계산합니다.

- 값이 감소한 경우 리셋으로 판단 → 현재 값을 그대로 사용

#### `pricing/litellmPricing.ts`

[BerriAI/litellm](https://github.com/BerriAI/litellm)의 오픈소스 가격표로 모델별 비용을 산정합니다.

- GitHub에서 `model_prices_and_context_window.json` 가져옴 (6시간 TTL)
- 모델명 매칭: 정확 매칭 → suffix 매칭 → alias 생성 (`-high`, `-thinking` 접미사 제거 등)
- 비용 = `Σ(카테고리 토큰 × 카테고리별 단가)`

---

### Orchestration

#### `monitor/tokenMonitorService.ts`

모든 모듈을 조율하는 중앙 서비스입니다.

**타이머**:

- Poll Timer: `pollIntervalMs` (기본 60초)마다 세션 스캔 + 파싱
- Export Timer: `rpcExportIntervalMs` (기본 300초)마다 RPC 내보내기
- Emit Debounce: 150ms 디바운스 후 UI 갱신 이벤트 발행

**다중 인스턴스 보호**:

- `PollLock.forRefresh()` / `PollLock.forExport()`로 파일 기반 락 획득
- 다른 VS Code 인스턴스가 이미 작업 중이면 해당 사이클 건너뜀
- 80% 쿨다운 체크: `lastPollAt` 기준으로 `pollIntervalMs × 0.8` 이내 재폴링 방지
- 디스크(`monitor-state.json`)에서 최신 상태를 재로드하여 다른 인스턴스의 작업 결과 반영

**캐시 초기화 (`resetCache()`)**:

- `RpcArtifactStore.clearAll()`로 전체 RPC 캐시 디렉토리 삭제
- 인메모리 상태 완전 초기화 후 처음부터 Export + Refresh 재실행

**`getDashboardState()` 출력 구조**:

| 필드                        | 내용                                                     |
| --------------------------- | -------------------------------------------------------- |
| `sessions[]`                | 세션별 토큰 집계 + 메시지 수 + 최근 12개 스냅샷 추이     |
| `summary`                   | 전체 세션/메시지 수, 변경 세션 수, 총 토큰, 추정 세션 수 |
| `pricing`                   | 총 비용(USD), 가격 매칭/미매칭 모델 수, 상태 메시지      |
| `analytics.activityHeatmap` | 최근 180일 일별 토큰 사용량 + 세션 수 + 비용(USD)        |
| `analytics.modelUsage`      | 모델별 토큰 총량, 세션 수, 비용                          |
| `analytics.rpcCoverage`     | 추적/내보내기/건너뛴/변경된 세션 수                      |
| `exportStatus`              | 내보내기 상태, 마지막 내보내기 시각, 내보낸 세션 수      |

#### `monitor/pollLock.ts`

파일 기반 락으로 다중 VS Code 인스턴스 간 중복 처리를 방지합니다.

- `{sessionRoot}/.token-monitor/refresh.lock` (리프레시용)
- `{sessionRoot}/.token-monitor/export.lock` (내보내기용)
- 락 파일에 PID + 획득 시각 기록
- Stale 락 자동 복구: 5분 타임아웃 초과 또는 PID가 죽은 경우 락을 해제하고 재획득

---

### Presentation

#### `statusBar/tokenStatusBar.ts`

VS Code 하단 상태바에 토큰 정보를 표시합니다.

- 총 토큰 수를 아이콘과 함께 상시 표시
- 동기화 중: `$(sync~spin)`, 에러: `$(warning)`, 정상: `$(graph)`
- 클릭 시 대시보드 오픈 (`openDashboard` 커맨드)

#### `webview/dashboardPanel.ts`

VS Code Webview 패널을 관리합니다.

- Svelte SPA를 Webview에 렌더링
- 양방향 메시지:
  - Extension → Webview: `dashboard/state` (DashboardState 전달), `dashboard/error`
  - Webview → Extension: `dashboard/ready`, `dashboard/refresh`
- 중복 전송 방지: JSON 직렬화 비교로 동일 상태 재전송 차단
- `retainContextWhenHidden: true`로 패널 숨김 시에도 상태 유지

#### Svelte 컴포넌트 트리

```
App.svelte
├── HeaderBar               상단 제목 + 동기화 상태 + 리프레시 카운트다운 타이머
├── KpiStrip                핵심 KPI (총 토큰, 세션 수, 비용 등)
├── dashboard-grid
│   ├── analysis-canvas
│   │   ├── ActivityHeatmap     180일 활동 히트맵
│   │   └── ModelUsage          모델별 사용량 테이블
│   └── operations-rail
│       └── TokenBreakdownPanel Input/Output/Cache/Reasoning 비율 분석
├── bottom-cards
│   ├── SourceModeBreakdown     RPC Coverage 요약
│   ├── SystemStatus            동기화/내보내기 상태
│   ├── Configuration           현재 설정값 표시
│   └── AboutMetrics            익스텐션 정보
└── session-deck
    └── SessionLeaderboard      세션별 토큰 사용량 순위표
        └── SparkBars           세션별 미니 차트
```

> **Note**: `InsightRail.svelte`와 `TokenMixBar.svelte` 파일은 존재하지만 현재 `App.svelte`에서 사용되지 않는 예비 컴포넌트입니다.

---

### Storage

| 저장소       | 경로                                                     | 용도                                                |
| ------------ | -------------------------------------------------------- | --------------------------------------------------- |
| RPC 아티팩트 | `{sessionRoot}/.token-monitor/rpc-cache/v1/{sessionId}/` | `manifest.json`, `usage.jsonl`, `steps.jsonl`       |
| 스냅샷 상태  | VS Code `globalStorageUri/monitor-state.json`            | 영구적인 세션 스냅샷 히스토리                       |
| 락 파일      | `{sessionRoot}/.token-monitor/refresh.lock`              | 다중 인스턴스 리프레시 중복 방지 (PID + 타임스탬프) |
| 락 파일      | `{sessionRoot}/.token-monitor/export.lock`               | 다중 인스턴스 내보내기 중복 방지 (PID + 타임스탬프) |

`RpcArtifactStore.clearAll()` 메서드로 전체 RPC 캐시를 일괄 삭제할 수 있습니다 (`Reset Cache` 커맨드).

---

## Configuration

| 설정                  | 기본값                  | 설명                         |
| --------------------- | ----------------------- | ---------------------------- |
| `sessionRoot`         | `~/.gemini/antigravity` | Antigravity 세션 루트 경로   |
| `pollIntervalMs`      | `60000`                 | 세션 리스캔 주기 (ms)        |
| `historyLimit`        | `120`                   | 세션당 보관 스냅샷 수        |
| `maxFileBytes`        | `524288`                | 파일 읽기 최대 크기 (bytes)  |
| `useRpcExport`        | `true`                  | RPC 아티팩트 내보내기 활성화 |
| `exportStepsJsonl`    | `false`                 | steps.jsonl 생성 여부        |
| `rpcExportIntervalMs` | `300000`                | RPC 내보내기 주기 (ms)       |
| `rpcTimeoutMs`        | `5000`                  | RPC 요청 타임아웃 (ms)       |

---

## Commands

| 커맨드                                           | 동작                                          |
| ------------------------------------------------ | --------------------------------------------- |
| `Antigravity Token Monitor: Open Dashboard`      | 대시보드 열기 + 내보내기 트리거               |
| `Antigravity Token Monitor: Refresh Now`         | 즉시 내보내기 + 대시보드 새로고침             |
| `Antigravity Token Monitor: Export Sessions Now` | 강제 전체 내보내기 + 결과 알림                |
| `Antigravity Token Monitor: Reset Cache`         | 모든 캐시 삭제 후 처음부터 재처리 (확인 필요) |

---

## File Structure

```
src/
├── extension.ts                          # 진입점 (activate/deactivate)
├── config.ts                             # 설정 읽기 + MonitorConfig 타입
├── types.ts                              # 전체 타입 정의
├── modelAliases.ts                       # 모델 플레이스홀더 ID → 실제 이름 매핑
│
├── rpc/                                  # 데이터 수집 (RPC)
│   ├── processLocator.ts                 #   Antigravity 프로세스 탐지
│   ├── antigravityRpcClient.ts           #   RPC 클라이언트 (연결 에러 시 재탐지)
│   └── trajectoryExporter.ts             #   JSONL 아티팩트 내보내기 (히스토리 세션 fallback 포함)
│
├── monitor/                              # 데이터 분석 + 오케스트레이션
│   ├── pollLock.ts                       #   파일 기반 락 (다중 인스턴스 중복 방지)
│   ├── sessionScanner.ts                 #   파일시스템 스캔
│   ├── sourceResolver.ts                 #   데이터 소스 결정
│   ├── sessionUsageCalculator.ts         #   스냅샷 델타 계산
│   └── tokenMonitorService.ts            #   중앙 오케스트레이터 (resetCache 포함)
│
├── parser/
│   └── antigravitySessionParser.ts       # 토큰 파싱 (reported/estimated + 모델 해석)
│
├── pricing/
│   └── litellmPricing.ts                 # LiteLLM 기반 비용 산정
│
├── storage/                              # 스토리지
│   ├── rpcArtifactStore.ts               #   RPC 아티팩트 CRUD + clearAll()
│   └── snapshotStore.ts                  #   영구 상태 저장
│
├── statusBar/                            # VS Code 상태바
│   ├── tokenStatusBar.ts                 #   상태바 제어
│   └── tokenStatusBarPresentation.ts     #   상태바 표시 로직
│
└── webview/                              # 대시보드 UI
    ├── main.ts                           #   Webview 진입점
    ├── dashboardPanel.ts                 #   Webview 패널 관리
    ├── getWebviewHtml.ts                 #   HTML 셸 생성
    ├── App.svelte                        #   루트 Svelte 컴포넌트
    ├── lib/
    │   ├── dashboardStore.ts             #   Svelte writable store
    │   ├── deriveDashboardInsights.ts    #   파생 데이터 계산
    │   ├── formatters.ts                 #   숫자/날짜 포매터
    │   └── vscodeApi.ts                  #   VS Code API 래퍼
    ├── test/                             #   Webview 테스트
    │   ├── fixtures/                     #     테스트 픽스처
    │   └── mocks/                        #     모킹
    └── components/                       #   UI 컴포넌트 (13개)
        ├── HeaderBar.svelte              #     상단 바 + 카운트다운 타이머
        ├── KpiStrip.svelte
        ├── ActivityHeatmap.svelte
        ├── ModelUsage.svelte
        ├── TokenBreakdownPanel.svelte
        ├── TokenMixBar.svelte            #     (예비 — 현재 미사용)
        ├── SourceModeBreakdown.svelte
        ├── SparkBars.svelte
        ├── SessionLeaderboard.svelte
        ├── InsightRail.svelte            #     (예비 — 현재 미사용)
        ├── SystemStatus.svelte
        ├── Configuration.svelte
        └── AboutMetrics.svelte
```
