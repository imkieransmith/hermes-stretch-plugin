# Saved Hermes docs

Snapshots of the official docs, fetched 2026-11-05, so agents can grep them
offline. **The live site wins if they disagree** — re-fetch before relying on
anything surprising.

| File | Source |
|---|---|
| `desktop-plugin-sdk.md` | https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk |
| `plugins-guide.md` | https://hermes-agent.nousresearch.com/docs/developer-guide/plugins |
| `desktop-plugins-skill-reference.md` | `skills/autonomous-ai-agents/hermes-agent/references/desktop-plugins.md` in NousResearch/hermes-agent (the agent-facing checklist) |

Useful sections in `desktop-plugin-sdk.md` (grep the heading):
`Host API`, `One package, both SDKs`, `Developing a unified package`,
`The Python side`, `Pushing events to your desktop half`, `Pitfalls`,
`Troubleshooting`. Canonical export list: `apps/desktop/src/sdk/index.ts` in
hermes-agent.

Catalog rules: https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/catalog-submission
