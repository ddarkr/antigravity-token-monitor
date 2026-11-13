import * as path from 'path';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import {
  aggregateActivityBreakdown,
  classifyStep,
  classifyToolName,
  extractStepActivityRow
} from './activityClassifier';
import { AntigravitySessionParser } from './antigravitySessionParser';

describe('activityClassifier', () => {
  it('classifies common Antigravity tool names and step types accurately', () => {
    expect(classifyToolName('view_file')).toBe('file_read');
    expect(classifyToolName('grep_search')).toBe('search');
    expect(classifyToolName('replace_file_content')).toBe('file_edit');
    expect(classifyToolName('run_command')).toBe('command');
    expect(classifyToolName('invoke_subagent')).toBe('agent');
    expect(classifyStep('CORTEX_STEP_TYPE_PLANNER_RESPONSE')).toBe('thinking_response');
    expect(classifyStep('CORTEX_STEP_TYPE_CHECKPOINT')).toBe('other');
  });

  it('attributes planner tokens across invoked tools without double-counting execution steps', () => {
    const plannerStep = {
      recordType: 'step',
      stepType: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE',
      toolNames: ['run_command', 'view_file']
    };
    const commandStep = {
      recordType: 'step',
      stepType: 'CORTEX_STEP_TYPE_RUN_COMMAND',
      toolNames: ['run_command']
    };
    const readStep = {
      recordType: 'step',
      stepType: 'CORTEX_STEP_TYPE_VIEW_FILE',
      toolNames: ['view_file']
    };
    const pureThinkingStep = {
      recordType: 'step',
      stepType: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE'
    };

    const rows = [
      extractStepActivityRow(plannerStep, 1000, { 'claude-opus-4-6': 1000 })!,
      extractStepActivityRow(commandStep, 0, {})!,
      extractStepActivityRow(readStep, 0, {})!,
      extractStepActivityRow(pureThinkingStep, 400, { 'claude-opus-4-6': 400 })!
    ];

    const summary = aggregateActivityBreakdown(rows);
    const commandBucket = summary.find((item) => item.category === 'command');
    const readBucket = summary.find((item) => item.category === 'file_read');
    const thinkingBucket = summary.find((item) => item.category === 'thinking_response');

    expect(commandBucket?.totalTokens).toBe(500);
    expect(commandBucket?.callCount).toBe(1);
    expect(commandBucket?.tools).toEqual({ run_command: 1 });
    expect(readBucket?.totalTokens).toBe(500);
    expect(readBucket?.callCount).toBe(1);
    expect(readBucket?.tools).toEqual({ view_file: 1 });
    expect(thinkingBucket?.totalTokens).toBe(400);
    expect(thinkingBucket?.modelTotals).toEqual({ 'claude-opus-4-6': 400 });
  });

  it('extracts activity breakdown from steps.jsonl alongside usage.jsonl without double-counting tokens', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ag-activity-parser-'));
    const usagePath = path.join(dir, 'usage.jsonl');
    const stepsPath = path.join(dir, 'steps.jsonl');

    await writeFile(
      usagePath,
      `${JSON.stringify({
        recordType: 'usage',
        model: 'claude-sonnet-4-6',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 300,
        totalTokens: 450
      })}\n`,
      'utf8'
    );
    await writeFile(
      stepsPath,
      [
        JSON.stringify({
          recordType: 'step',
          stepType: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE',
          toolNames: ['replace_file_content'],
          modelUsage: {
            model: 'claude-sonnet-4-6',
            inputTokens: 100,
            outputTokens: 50,
            cacheReadTokens: 300
          }
        }),
        JSON.stringify({
          recordType: 'step',
          stepType: 'CORTEX_STEP_TYPE_CODE_ACTION',
          toolNames: ['replace_file_content']
        })
      ].join('\n'),
      'utf8'
    );

    const parser = new AntigravitySessionParser(1024 * 1024);
    const totals = await parser.parse({
      sessionId: 's-activity',
      sessionDir: dir,
      tokenFilePaths: [usagePath, stepsPath],
      labelHint: 'Activity Session',
      lastModifiedMs: 123456,
      analysisSignature: 'sig',
      source: 'rpc-artifact'
    });

    expect(totals.totalTokens).toBe(450);
    expect(totals.activityBreakdown).toHaveLength(1);
    expect(totals.activityBreakdown?.[0]).toMatchObject({
      category: 'file_edit',
      label: '代码编辑',
      callCount: 1,
      totalTokens: 450,
      tools: { replace_file_content: 1 },
      modelTotals: { 'claude-sonnet-4-6': 450 }
    });
  });
});
