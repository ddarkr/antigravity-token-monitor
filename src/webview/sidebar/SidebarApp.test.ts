import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import SidebarApp from './SidebarApp.svelte';
import { dashboardState } from '../lib/dashboardStore';
import { mockDashboardState } from '../test/fixtures/dashboardState.fixture';

describe('SidebarApp', () => {
  beforeEach(() => {
    dashboardState.set(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders loading state initially', () => {
    const { getByText } = render(SidebarApp);
    expect(getByText('正在加载 Token 数据...')).toBeTruthy();
  });

  it('renders sidebar shell with all sections when state is provided', () => {
    dashboardState.set(mockDashboardState);
    const { getByText, container } = render(SidebarApp);

    // Header
    expect(getByText('Token 概览')).toBeTruthy();

    // KPI section
    expect(getByText('活跃会话')).toBeTruthy();
    expect(getByText('消息数')).toBeTruthy();
    expect(getByText('预估费用')).toBeTruthy();

    // Token Breakdown section
    expect(getByText('Token 构成分布')).toBeTruthy();

    // Model Usage section
    expect(getByText('模型使用量')).toBeTruthy();
    expect(getByText('mock-model')).toBeTruthy();

    // Heatmap section
    expect(getByText('近 30 天活跃度')).toBeTruthy();

    // Session List section
    expect(getByText('会话明细')).toBeTruthy();
    expect(getByText('Session 1')).toBeTruthy();

    // Sync Status section
    expect(getByText('运行状态')).toBeTruthy();

    // Verify sidebar-specific structure
    const shell = container.querySelector('.sidebar-shell');
    expect(shell).toBeTruthy();
    const header = container.querySelector('.sidebar-header');
    expect(header).toBeTruthy();
  });

  it('shows active session count in session header', () => {
    dashboardState.set(mockDashboardState);
    const { getByText } = render(SidebarApp);
    expect(getByText('1 活跃')).toBeTruthy();
  });

  it('displays cost when pricing is available', () => {
    dashboardState.set(mockDashboardState);
    const { getAllByText, getByText } = render(SidebarApp);
    // Both SidebarKpi total cost and Session 1 row display $0.0041
    expect(getAllByText('$0.0041').length).toBeGreaterThanOrEqual(2);
    expect(getByText(/缓存省 \$0\.0012/)).toBeTruthy();
  });

  it('shows estimated session indicator', () => {
    dashboardState.set(mockDashboardState);
    const { getByText } = render(SidebarApp);
    // mockDashboardState has 1 estimated session
    expect(getByText(/1 个估算/)).toBeTruthy();
  });

  it('shows archived sessions info', () => {
    dashboardState.set(mockDashboardState);
    const { getByText } = render(SidebarApp);
    expect(getByText(/1 个已归档/)).toBeTruthy();
  });
});
