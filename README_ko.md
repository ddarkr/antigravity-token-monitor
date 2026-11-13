# Antigravity Token Monitor (토큰 모니터링 대시보드)

[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visualstudiocode)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte)](https://svelte.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](readme.md) | [简体中文](README_zh.md) | **[한국어](README_ko.md)**

> Antigravity 세션의 토큰 사용량, 모델별 통계 및 예상 비용을 시각화하는 대시보드 확장 프로그램.

![Dashboard Preview](docs/screenshot.png)

**Antigravity Token Monitor**는 [Antigravity](https://blog.google/technology/google-deepmind/) 코딩 세션 전반의 **토큰 사용량**을 자동으로 수집, 분석 및 시각화하는 VS Code 확장 프로그램입니다. 실행 중인 Antigravity 프로세스의 내부 RPC에 연결하여 토큰 메타데이터를 로컬 JSONL 아티팩트로 내보내고, Svelte 기반의 풍부한 대시보드와 상태 표시줄을 통해 직관적인 인사이트를 제공합니다.

---

## 🌟 주요 기능

- 🔥 **실시간 토큰 추적** — 모든 Antigravity 세션의 토큰 증가량 및 사용량을 자동으로 모니터링
- 📅 **날짜 및 기간 필터링** — **전체 기간 / 오늘 / 최근 24시간 / 최근 7일 / 최근 30일 / 사용자 정의 날짜 선택기**를 통한 실시간 동적 재계산
- 📈 **고대비 에메랄드 히트맵** — 4분위수(Quantile) 동적 등급 알고리즘을 적용한 180일 활동 캘린더 히트맵
- 🏷️ **4색 고대비 토큰 구성** — 입력(블루), 출력(그린), 캐시(퍼플), 추론(앰버)으로 유형별 점유율을 명확히 구분
- 💰 **모델별 예상 비용 산출** — [LiteLLM](https://github.com/BerriAI/litellm) 오픈소스 가격 데이터를 연동하여 모델별 세부 비용 계산
- 📌 **사이드바 미니 대시보드** — Activity Bar에 상주하는 컴팩트 패널 (KPI, 토큰 믹스, 모델 사용량, 30일 히트맵, 세션 목록)
- 🖥️ **상태 표시줄 실시간 카운터** — VS Code 하단 상태 표시줄에 항상 총 토큰 수를 표시하고 툴팁 제공
- 🪟 **Windows 및 크로스 플랫폼 지원** — PowerShell WMI 및 포트 감지를 통한 완벽한 Windows 호환성 보장
- 🔒 **다중 인스턴스 안전성** — 파일 기반 락(PollLock)을 통해 여러 VS Code 창 실행 시 중복 새로고침 방지

---

## ⚠️ 고지 사항 (Disclaimer)

> [!WARNING]
> - 본 프로젝트는 **비공식 커뮤니티 오픈소스 프로젝트**이며 Google과 제휴하거나 승인받지 않았습니다.
> - 본 확장은 Antigravity 프로세스의 문서화되지 않은 내부 RPC를 활용하므로 향후 버전 업데이트에 따라 동작이 달라질 수 있습니다.
> - 비용 예측치는 [LiteLLM 오픈소스 가격표](https://github.com/BerriAI/litellm)에 기반한 추정치이므로 **실제 금융/결제 결정의 근거로 사용하지 마십시오**.
> - 확장 프로그램은 로컬 `127.0.0.1` 통신만 수행하며 외부 서버로 데이터를 전송하지 않습니다.

---

## 🚀 빠른 시작

### 요구 사항
- [VS Code](https://code.visualstudio.com/) `≥ 1.96.0` 또는 Antigravity IDE
- [Node.js](https://nodejs.org/) `≥ 18`

### 설치 방법

#### 방법 1: VSIX 파일로 직접 설치
1. Release 페이지에서 `antigravity-token-monitor-0.0.17.vsix` 다운로드;
2. IDE에서 `Ctrl + Shift + P` (Mac: `Cmd + Shift + P`) 입력;
3. `Extensions: Install from VSIX...`를 선택하고 다운로드한 파일을 지정하여 설치.

#### 방법 2: 소스코드 빌드
```bash
# 저장소 복제
git clone https://github.com/THE-XSX/antigravity-token-monitor.git
cd antigravity-token-monitor

# 의존성 설치
npm install

# 컴파일 및 패키징
npm run compile
npm run package
```

---

## 💻 주요 명령어

| 명령어 | 설명 |
| :--- | :--- |
| `Antigravity Token Monitor: Open Dashboard` | 메인 토큰 모니터링 대시보드 열기 |
| `Antigravity Token Monitor: Refresh Now` | 즉시 데이터 다시 스캔 및 새로고침 |
| `Antigravity Token Monitor: Export Sessions Now` | RPC 세션 강제 내보내기 |
| `Antigravity Token Monitor: Reset Cache` | 로컬 분석 캐시 삭제 후 처음부터 다시 처리 |

---

## 📄 라이선스

이 프로젝트는 [MIT License](LICENSE.txt)에 따라 사용이 허가됩니다.
