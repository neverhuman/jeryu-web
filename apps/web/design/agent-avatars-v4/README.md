# Agent bots, v4

Every agent gets a robot avatar that is recognizable at a glance and never
changes unless rerolled. The approved v4 design reference is ported in full to
`src/components/agentBot/` (`agentBotModel.ts` decides, `AgentBot.tsx` draws,
`AgentBot.css` moves), including the full body, so profile pages and larger
cards can use it later without another port.

## The system

| Input | Decides | Detail |
|---|---|---|
| Harness | silhouette and brand color | Claude → Capsule on legs, terracotta. Codex → Block on treads, OpenAI green. Agy → Orb, hovering. GPT → Dome on a wheel, OpenAI green. Gemini → Prism on stilts, Gemini blue. Any other harness (Cursor, Grok, …) gets a stable hashed archetype and hue. |
| Type | gear | Workers (Jeryu runs, queue workers, reviewers, gates) carry a claw hand and a tool belt. Ad hoc agents (CLI sessions) have an open hand and a dashed seam. |
| Id (+ variant) | personality | Visor (4), eyes (5), mouth (3), antenna (5), ears (3), chest mark (5), decal (3), accessory (4), limb finish (2), pose (4) and gaze (3): over a million combinations, from a seeded FNV-1a + mulberry32 stream. Bump `variant` to reroll. |
| Status | motion | Working bobs and leans in. Thinking bobs, leans back, orbits and pulses its antenna. Idle turns gray and stops. Error and done hold still with a red or green badge. Reduced motion stops everything. |

Presence maps onto it in `botOfPresence`: `active` → working, `idle` and
`stale` → idle, `ended` → done. Presence has no thinking or error signal yet;
both states are drawn and ready.

## Modes

- `badge`: the head alone in a dark disc, for lists, logs and chat (24–48px).
- `full`: the whole bot for cards and profiles (96px and up). It is 148/120
  as tall as it is wide.

## Where it is used

`/agents` (Active agents): a 40px badge on the left of every list row, and a
full bot on every card in the Cards view. Both sit with a timeline strip of
when the agent was first seen, worked and finished (`pages/agents/presenceTimelineModel.ts`).

## Porting notes

The reference builds SVG as strings. The port draws the same shapes as React
elements, so no markup string is ever injected, and gradient and clip ids come
from `useId` so many bots can share a page. Trait order is unchanged, so the
same id gives the same look as the reference.
