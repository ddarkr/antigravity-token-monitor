# Known Issues

## Sessions showing as "estimated" despite having RPC data

### Symptoms
- Dashboard shows certain sessions as `estimated` mode with low token counts (e.g., 21,105 tokens)
- The same sessions show `reported` mode in parser tests but not in the dashboard
- Sessions with large `usage.jsonl` files (>512KB) are affected

### Root Cause
The default value for `maxFileBytes` was set to 512KB (524,288 bytes) in the configuration. When parsing sessions, if the `usage.jsonl` file exceeds this limit, the parser skips reading it and falls back to estimating tokens from text content, resulting in `estimated` mode with artificially low counts.

Large sessions can easily generate `usage.jsonl` files of 2MB or more, exceeding the 512KB default.

### Solution

**Option 1: Update the extension (v0.0.15+)**
- Install version 0.0.15 or later, which increases the default `maxFileBytes` to 10MB

**Option 2: Configure manually**
1. Open Antigravity/VS Code Settings (`Cmd+,`)
2. Search for `antigravity-token-monitor.maxFileBytes`
3. Increase the value to `10485760` (10MB) or higher

```json
{
  "antigravity-token-monitor.maxFileBytes": 10485760
}
```

### How to Diagnose
Enable debug logging in settings:
```json
{
  "antigravity-token-monitor.debug": true
}
```

After restarting and refreshing the dashboard, check the **Antigravity Token Monitor** output channel. You'll see logs like:
```
DEBUG: maxFileBytes=524288 parsePlan.tokenFilePaths=...
```

If `maxFileBytes` shows `524288` (512KB), your setting is too low.

### Verification
After applying the fix, refresh the dashboard. The session should now show:
- `mode: reported`
- `totalTokens: 50,000,000+` (actual RPC count)
