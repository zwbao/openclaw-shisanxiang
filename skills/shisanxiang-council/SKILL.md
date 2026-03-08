---
name: shisanxiang-council
description: Run the 十三香人格议会 when the user explicitly wants structured internal debate, disagreement mapping, or current-vs-ideal self comparison before deciding.
---

# 十三香议会

Use this skill only when the user explicitly wants explanation, internal debate, or self-comparison. It is not the normal reply-drafting path.

## Workflow

1. Call `shisanxiang_council` with the user's question.
2. Present the final recommendation, major disagreements, and current-vs-ideal deltas.
3. If the user then wants a concrete action, follow up with `shisanxiang_decide` or `shisanxiang_draft_reply`.

## Guardrails

- Do not invoke the council for every turn.
- Keep the council explanatory. It is not the default execution path.
- If the user gives corrective feedback after reading the council, record it with `shisanxiang_feedback`.
- If there is no explicit ideal-self signal yet, say that clearly instead of pretending the ideal model is fully trained.
