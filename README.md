# openclaw-shisanxiang

`十三香小龙虾` is an OpenClaw identity-layer plugin for building a personal
digital twin. Its goal is not just to draft private messages, but to help
OpenClaw gradually become a usable version of the real you, or the aspirational
you you explicitly want to become.

The current MVP starts with a narrower slice of that vision: private-message
drafting that learns from eligible conversations and explicit feedback.

This repository is intentionally written as both:

- a technical README for installing and enabling the plugin
- a lightweight PRD for what the MVP is actually trying to build

## Why the name

In Chinese internet and food culture, `十三香小龙虾` means crawfish cooked with
`十三香`, a famous spice blend associated with a layered, mixed flavor profile.

That metaphor is the point of the name:

- a person is not a single fixed persona
- a person is a mix of multiple tendencies, values, impulses, and constraints
- what we call “the self” is usually the weighted result of those tendencies

So `十三香` here does **not** mean “exactly 13 hard-coded personalities.”
It means:

- identity is compositional
- decision making is mixed
- the model should become more like the user over time, not stay a static prompt

`小龙虾` adds the deliberately internet-native, memorable, slightly chaotic
product flavor. The project is serious about user modeling, but it does not need
to sound sterile.

## Product definition

OpenClaw's default interaction pattern is still the normal assistant pattern:

1. the user says what to do
2. OpenClaw does it

That is useful, but still shallow.

The long-term thesis behind `十三香小龙虾` is different:

> OpenClaw should not only help you.  
> OpenClaw should gradually become a usable digital twin of you.

The first deployable slice of that idea is not a full digital human. It is a
much narrower MVP:

- private-message twin first
- drafting first, not autonomous action first
- current self first, ideal self second
- feedback loop first, personality theater second

## MVP scope

Current MVP behavior:

- Learn only from main/private conversations
- Default to your **current self**
- Focus on:
  - whether to reply
  - reply draft
  - tone notes
  - risk level
  - confidence
- Keep `decide` and `council` as secondary tools
- Do **not** auto-send messages by default

Non-goals for this MVP:

- no Control UI panel
- no mobile or embodied integration
- no multi-tool autonomous execution layer
- no memory-slot or context-engine replacement
- no “fully trained digital clone” claims

## Core model

The plugin maintains two self-models:

- `current`
  - what the user currently seems to be like
  - learned from eligible conversation turns and explicit feedback
- `ideal`
  - what the user explicitly says they want to sound or behave like
  - learned only from explicit feedback or explicit target selection

This separation matters. Without it, the system will confuse:

- what the user does by habit
- what the user wants to become

## Architecture

The MVP is implemented as a bundled-style OpenClaw plugin with five internal
subsystems:

- `store`
  - SQLite-backed persistence for observations, events, and snapshots
- `learning`
  - extracts passive signals from private conversations and active signals from
    explicit feedback
- `modeling`
  - builds `current` and `ideal` snapshots and derives persona weights
- `decision`
  - produces reply drafts, risk/confidence scores, and explicit council output
- `prompting`
  - injects a compact twin summary for eligible private sessions

Main runtime hooks:

- `message_received`
- `agent_end`
- `before_prompt_build`

Main tools:

- `shisanxiang_draft_reply`
- `shisanxiang_status`
- `shisanxiang_feedback`
- `shisanxiang_decide`
- `shisanxiang_council`

## Recommended mental model

Think of this plugin as:

- not a personality test
- not a roleplay pack
- not a generic memory plugin

It is closer to:

- an identity layer that starts from private communication
- a user-model system that separates current self from ideal self
- an incremental bridge from “assistant” to “digital twin”

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

Behavior notes:

- `defaultMode: "mirror"` means “like my current self” for normal drafting
- `ideal` is trained only through explicit feedback or explicit target selection
- `autoSendEnabled` stays off for the MVP even if a draft is low-risk

## Main commands

```bash
openclaw shisanxiang status
openclaw shisanxiang feedback --item-type draft_reply --outcome edited --user-edit "收到，我先看一下，稍后明确回复你。"
openclaw shisanxiang council "Should I reply now or wait until tomorrow?"
openclaw shisanxiang export-model
```

## Recommended MVP workflow

1. Turn the plugin on and restart the Gateway.
2. Use OpenClaw normally in a private conversation.
3. After 10 or more eligible turns, inspect the model with `openclaw shisanxiang status`.
4. Use `shisanxiang_draft_reply` for a real private message.
5. If the draft is close but wrong, correct it with `shisanxiang_feedback`.
6. Watch later drafts shift as the model accumulates signal.

## Risk boundaries

- Treat the model as probabilistic, not authoritative.
- High-risk topics such as money, legal commitments, job moves, permissions, or
  long-term commitments should still be reviewed by the user.
- If no explicit ideal-self signal exists yet, the plugin should say so instead
  of pretending the ideal model is already trained.

## Runtime notes

- The plugin uses the Node `node:sqlite` builtin.
- Use a Node runtime that includes SQLite support.
- The current repository is optimized for local/plugin-folder usage first, not
  npm distribution first.
