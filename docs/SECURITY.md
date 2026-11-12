# Security

## 위협 모델

### 공격 표면

| 표면 | 설명 | 위험도 |
|------|------|--------|
| Antigravity RPC | `127.0.0.1`에 HTTPS로 연결, 자체 서명 인증서 | Low (로컬 전용) |
| CSRF 토큰 | 프로세스 인수에서 추출, 모든 RPC 요청에 첨부 | Medium |
| 가격표 (models.dev / LiteLLM) | `models.dev/api.json` 및 GitHub LiteLLM JSON 읽기 전용 다운로드 (허용된 외부 네트워크) | Low |
| 로컬 파일 | JSONL 아티팩트, 스냅샷, 락 파일 | Low |
| `exportStepsJsonl` | 활성화 시 대화 내용이 **평문 JSONL**로 저장 | **High** |

### 보안 원칙

1. **로컬 전용**: 모든 RPC 통신은 `127.0.0.1`에만 연결. 외부 서버로 데이터 전송 없음.
2. **CSRF 보호**: 모든 RPC 요청에 프로세스에서 추출한 CSRF 토큰을 `x-csrf-token` 헤더로 전송.
3. **자체 서명 인증서**: `rejectUnauthorized: false`로 자체 서명 인증서를 수용 (로컬 전용이므로).

### 민감 데이터 처리

#### `exportStepsJsonl` 설정

`steps.jsonl`은 항상 생성되지만, 저장 범위는 `exportStepsJsonl` 설정에 따라 달라집니다:

| 설정 | 저장 내용 | 위험도 |
|------|-----------|--------|
| `false` (기본) | 메타데이터만 (`recordType`, `role`, `timestamp`, `model`) | **Low** — 대화 내용 없음 |
| `true` | 메타데이터 + **평문 대화 내용** (`text` 필드 포함) | **High** — 디버깅 전용 |

- 경로: `~/.gemini/antigravity/.token-monitor/rpc-cache/v1/{sessionId}/steps.jsonl`
- 기본값 `false`에서도 `messageCount`는 정확하게 집계됩니다.
- `true`는 디버깅 용도로만 사용해야 합니다. Antigravity가 암호화하여 저장하는 대화 내용이 평문으로 노출됩니다.

#### 토큰/비용 데이터

- 토큰 사용량과 비용 추정치는 `monitor-state.json`에 영속화됩니다.
- VS Code `globalStorageUri` 하위에 저장되므로 사용자별 격리됩니다.

### 코드 보안 규칙

1. 외부 네트워크 요청 추가 시 반드시 리뷰어 승인 필요.
2. `rejectUnauthorized: false`는 `127.0.0.1` 연결에만 허용.
3. CSRF 토큰을 로그에 출력하지 않음.
4. 민감 데이터(대화 내용)는 기본적으로 수집하지 않음 (`exportStepsJsonl: false` — 메타데이터만 저장).
