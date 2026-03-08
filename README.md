# openclaw-shisanxiang

Shisanxiang is an OpenClaw plugin for private-message drafting that learns from
eligible conversations and explicit feedback so OpenClaw gradually sounds more
like you.

Current MVP scope:

- Learn only from main/private conversations
- Default to your current self
- Focus on whether to reply, reply draft, tone notes, and risk/confidence
- Keep `decide` and `council` as secondary tools
- Do not auto-send messages by default

## Install

This repository is currently intended for local/plugin-folder installation.

```bash
git clone git@github.com:zwbao/openclaw-shisanxiang.git
openclaw plugins install /path/to/openclaw-shisanxiang
cd /path/to/openclaw-shisanxiang
npm install
```

Restart the Gateway afterwards.

## Enable

Configure under `plugins.entries.shisanxiang`:

```json5
{
  plugins: {
    entries: {
      shisanxiang: {
        enabled: true,
        config: {
          enabled: true,
          learning: {
            enabled: true,
            scope: "main_private_only"
          },
          models: {
            defaultMode: "mirror",
            aspirationalWeight: 0.25
          },
          autonomy: {
            mode: "balanced",
            autoSendEnabled: false,
            autoSendConfidenceThreshold: 0.9
          },
          storage: {
            path: "~/.openclaw/agents/{agentId}/shisanxiang.sqlite"
          }
        }
      }
    }
  }
}
```

## Main commands

```bash
openclaw shisanxiang status
openclaw shisanxiang feedback --item-type draft_reply --outcome edited --user-edit "收到，我先看一下，稍后明确回复你。"
openclaw shisanxiang council "Should I reply now or wait until tomorrow?"
openclaw shisanxiang export-model
```

## Notes

- `current` and `ideal` are separate by design.
- `ideal` only learns from explicit feedback or explicit target selection.
- High-risk topics should still be reviewed by the user.
- The plugin uses the Node `node:sqlite` builtin, so use a Node runtime that includes SQLite support.
