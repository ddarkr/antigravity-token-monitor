import type { ActivityCategory, SessionActivityBreakdown } from '../types';

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  file_read: '文件读取',
  search: '搜索检索',
  file_edit: '代码编辑',
  command: '终端命令',
  agent: '代理协同',
  thinking_response: '推理与回复',
  other: '其他操作'
};

const TOOL_CATEGORY_MAP: Record<string, ActivityCategory> = {
  view_file: 'file_read',
  read_file: 'file_read',
  view_file_outline: 'file_read',
  view_code_item: 'file_read',
  list_dir: 'file_read',
  grep_search: 'search',
  find_by_name: 'search',
  search_web: 'search',
  read_url_content: 'search',
  search_marketplace: 'search',
  replace_file_content: 'file_edit',
  multi_replace_file_content: 'file_edit',
  write_to_file: 'file_edit',
  edit_file: 'file_edit',
  write_file: 'file_edit',
  run_command: 'command',
  send_command_input: 'command',
  command_status: 'command',
  read_terminal: 'command',
  manage_task: 'command',
  invoke_subagent: 'agent',
  define_subagent: 'agent',
  manage_subagents: 'agent',
  send_message: 'agent',
  ask_question: 'agent',
  swarm: 'agent',
  schedule: 'agent'
};

const STEP_TYPE_CATEGORY_MAP: Record<string, ActivityCategory> = {
  CORTEX_STEP_TYPE_VIEW_FILE: 'file_read',
  CORTEX_STEP_TYPE_READ_FILE: 'file_read',
  CORTEX_STEP_TYPE_LIST_DIR: 'file_read',
  CORTEX_STEP_TYPE_VIEW_OUTLINE: 'file_read',
  CORTEX_STEP_TYPE_VIEW_CODE_ITEM: 'file_read',
  CORTEX_STEP_TYPE_GREP_SEARCH: 'search',
  CORTEX_STEP_TYPE_FIND_BY_NAME: 'search',
  CORTEX_STEP_TYPE_SEARCH_WEB: 'search',
  CORTEX_STEP_TYPE_READ_URL_CONTENT: 'search',
  CORTEX_STEP_TYPE_CODE_ACTION: 'file_edit',
  CORTEX_STEP_TYPE_WRITE_TO_FILE: 'file_edit',
  CORTEX_STEP_TYPE_EDIT_FILE: 'file_edit',
  CORTEX_STEP_TYPE_RUN_COMMAND: 'command',
  CORTEX_STEP_TYPE_COMMAND_STATUS: 'command',
  CORTEX_STEP_TYPE_SEND_COMMAND_INPUT: 'command',
  CORTEX_STEP_TYPE_INVOKE_SUBAGENT: 'agent',
  CORTEX_STEP_TYPE_ASK_QUESTION: 'agent',
  CORTEX_STEP_TYPE_SEND_MESSAGE: 'agent',
  CORTEX_STEP_TYPE_PLANNER_RESPONSE: 'thinking_response',
  CORTEX_STEP_TYPE_CHECKPOINT: 'other',
  CORTEX_STEP_TYPE_USER_INPUT: 'other',
  CORTEX_STEP_TYPE_SYSTEM_MESSAGE: 'other',
  CORTEX_STEP_TYPE_ERROR_MESSAGE: 'other'
};

export function classifyToolName(toolName: string): ActivityCategory {
  const normalized = toolName.trim().toLowerCase();
  if (!normalized) {
    return 'other';
  }
  const direct = TOOL_CATEGORY_MAP[normalized];
  if (direct) {
    return direct;
  }
  if (normalized.includes('read') || normalized.includes('view') || normalized.includes('list_dir')) {
    return 'file_read';
  }
  if (normalized.includes('search') || normalized.includes('grep') || normalized.includes('find')) {
    return 'search';
  }
  if (normalized.includes('edit') || normalized.includes('write') || normalized.includes('replace')) {
    return 'file_edit';
  }
  if (normalized.includes('command') || normalized.includes('terminal') || normalized.includes('shell')) {
    return 'command';
  }
  if (normalized.includes('subagent') || normalized.includes('agent') || normalized.includes('swarm') || normalized.includes('message')) {
    return 'agent';
  }
  return 'other';
}

export function classifyStep(stepType?: string, toolNames?: string[]): ActivityCategory {
  if (toolNames && toolNames.length > 0) {
    return classifyToolName(toolNames[0]);
  }
  if (stepType) {
    const mapped = STEP_TYPE_CATEGORY_MAP[stepType.trim().toUpperCase()];
    if (mapped) {
      return mapped;
    }
  }
  return 'other';
}

export type StepActivityRow = {
  stepType?: string;
  toolNames?: string[];
  totalTokens: number;
  modelTotals: Record<string, number>;
};

type ActivityBucket = {
  category: ActivityCategory;
  stepCount: number;
  callCount: number;
  totalTokens: number;
  tools: Record<string, number>;
  modelTotals: Record<string, number>;
};

function getOrCreateBucket(map: Map<ActivityCategory, ActivityBucket>, category: ActivityCategory): ActivityBucket {
  let bucket = map.get(category);
  if (!bucket) {
    bucket = {
      category,
      stepCount: 0,
      callCount: 0,
      totalTokens: 0,
      tools: {},
      modelTotals: {}
    };
    map.set(category, bucket);
  }
  return bucket;
}

function addWeightedModelTotals(
  target: Record<string, number>,
  source: Record<string, number>,
  weight: number
): void {
  for (const [model, value] of Object.entries(source)) {
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }
    target[model] = (target[model] ?? 0) + value * weight;
  }
}

export function extractStepActivityRow(
  parsed: unknown,
  rowTokens: number,
  rowModelTotals: Record<string, number>
): StepActivityRow | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const stepType = typeof obj.stepType === 'string' && obj.stepType.trim()
    ? obj.stepType.trim()
    : typeof obj.type === 'string' && obj.type.trim()
      ? obj.type.trim()
      : undefined;

  const toolNames: string[] = [];
  if (Array.isArray(obj.toolNames)) {
    for (const item of obj.toolNames) {
      if (typeof item === 'string' && item.trim()) {
        toolNames.push(item.trim());
      }
    }
  } else {
    const metadata = obj.metadata && typeof obj.metadata === 'object' ? (obj.metadata as Record<string, unknown>) : undefined;
    const toolCall = metadata?.toolCall && typeof metadata.toolCall === 'object'
      ? (metadata.toolCall as Record<string, unknown>)
      : undefined;
    if (typeof toolCall?.name === 'string' && toolCall.name.trim()) {
      toolNames.push(toolCall.name.trim());
    }
    const planner = obj.plannerResponse && typeof obj.plannerResponse === 'object'
      ? (obj.plannerResponse as Record<string, unknown>)
      : undefined;
    if (Array.isArray(planner?.toolCalls)) {
      for (const call of planner.toolCalls) {
        if (call && typeof call === 'object') {
          const name = (call as Record<string, unknown>).name;
          if (typeof name === 'string' && name.trim()) {
            toolNames.push(name.trim());
          }
        }
      }
    }
  }

  if (!stepType && toolNames.length === 0) {
    return null;
  }

  return {
    stepType,
    toolNames: toolNames.length > 0 ? toolNames : undefined,
    totalTokens: rowTokens,
    modelTotals: rowModelTotals
  };
}

export function aggregateActivityBreakdown(rows: StepActivityRow[]): SessionActivityBreakdown[] {
  if (rows.length === 0) {
    return [];
  }

  const buckets = new Map<ActivityCategory, ActivityBucket>();
  const hasNonPlannerToolSteps = rows.some(
    (row) => row.stepType !== 'CORTEX_STEP_TYPE_PLANNER_RESPONSE' && Boolean(row.toolNames?.length)
  );

  for (const row of rows) {
    const isPlanner = row.stepType === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE';
    const tools = row.toolNames ?? [];

    if (isPlanner && tools.length > 0) {
      const weight = 1 / tools.length;
      for (const toolName of tools) {
        const category = classifyToolName(toolName);
        const bucket = getOrCreateBucket(buckets, category);
        bucket.stepCount += weight;
        bucket.totalTokens += row.totalTokens * weight;
        addWeightedModelTotals(bucket.modelTotals, row.modelTotals, weight);
        if (!hasNonPlannerToolSteps) {
          bucket.callCount += 1;
          bucket.tools[toolName] = (bucket.tools[toolName] ?? 0) + 1;
        }
      }
      continue;
    }

    const category = classifyStep(row.stepType, tools);
    const bucket = getOrCreateBucket(buckets, category);
    bucket.stepCount += 1;
    bucket.totalTokens += row.totalTokens;
    addWeightedModelTotals(bucket.modelTotals, row.modelTotals, 1);

    if (!isPlanner && tools.length > 0) {
      for (const toolName of tools) {
        bucket.callCount += 1;
        bucket.tools[toolName] = (bucket.tools[toolName] ?? 0) + 1;
      }
    }
  }

  return Array.from(buckets.values())
    .map((bucket): SessionActivityBreakdown => {
      const roundedModelTotals: Record<string, number> = {};
      for (const [model, value] of Object.entries(bucket.modelTotals)) {
        const rounded = Math.round(value);
        if (rounded > 0) {
          roundedModelTotals[model] = rounded;
        }
      }
      return {
        category: bucket.category,
        label: ACTIVITY_CATEGORY_LABELS[bucket.category],
        stepCount: Math.round(bucket.stepCount * 10) / 10,
        callCount: bucket.callCount,
        totalTokens: Math.round(bucket.totalTokens),
        tools: bucket.tools,
        ...(Object.keys(roundedModelTotals).length > 0 ? { modelTotals: roundedModelTotals } : {})
      };
    })
    .filter((item) => item.totalTokens > 0 || item.callCount > 0 || item.stepCount > 0)
    .sort((a, b) => b.totalTokens - a.totalTokens || b.callCount - a.callCount || b.stepCount - a.stepCount);
}
