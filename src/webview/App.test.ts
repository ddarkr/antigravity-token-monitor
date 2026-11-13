import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import App from './App.svelte';
import { dashboardState, selectedSessionId } from './lib/dashboardStore';
import { mockDashboardState } from './test/fixtures/dashboardState.fixture';

describe('App', () => {
  beforeEach(() => {
    dashboardState.set(null);
    selectedSessionId.set(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders loading state initially', () => {
    const { getByText } = render(App);
    expect(getByText('正在加载仪表盘数据...')).toBeTruthy();
  });

  it('renders dashboard shell with key sections when state is provided', () => {
    dashboardState.set(mockDashboardState);
    const { getByRole, getAllByText, getByText } = render(App);
    
    expect(getAllByText(/Antigravity Token/i).length).toBeGreaterThan(0);
    
    expect(getByRole('region', { name: /overview hero/i })).toBeTruthy();
    expect(getByRole('region', { name: /analysis canvas/i })).toBeTruthy();
    expect(getByRole('complementary', { name: /operations rail/i })).toBeTruthy();
    expect(getByRole('region', { name: /session deck/i })).toBeTruthy();
    expect(getAllByText('$0.0041').length).toBeGreaterThan(0);
    expect(getByText(/缓存节省 \$0\.0012/)).toBeTruthy();
    expect(getByText(/No LiteLLM pricing match/i)).toBeTruthy();
  });

  it('opens session detail modal on row click and closes cleanly', async () => {
    dashboardState.set(mockDashboardState);
    const { getByRole, queryByRole, getByText } = render(App);

    const sessionRow = getByRole('button', { name: /查看会话详情：Session 1/i });
    await fireEvent.click(sessionRow);

    const dialog = getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(getByText('工具与操作类型归因')).toBeTruthy();
    expect(getByText('代码编辑')).toBeTruthy();
    expect(getByText(/replace_file_content ×2/)).toBeTruthy();

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(queryByRole('dialog')).toBeNull();
  });
});
