# Audit fixes: October 3, 2026

This tracks the findings in `audits/AUDIT-2026-10-03-0127.md` against the current code. The audit was written during implementation, so some findings predate the previous flow-fix commit. `GAME_SPEC.md` remains the working design; the original brief does not replace it.

## Addressed in this pass

| Finding | Change and evidence |
| --- | --- |
| H-01: updates cancel taps and disturb typing | Existing DOM nodes are patched in place; handlers are delegated once. A real held mouse press survives three partner messages and activates on release. Radio input identity, draft, selection and composition events survive snapshots; invalid join preserves both fields. Opening animation identity is retained. Physical phone keyboards remain untested. |
| B-01: hidden tabs block play | Readiness, opening and ordinary actions continue while connected. A deliberate beam lasts ten seconds after hiding for tab handoff; hidden input cannot renew it. Disconnect and phase changes clear light. Finale overlap requires both visible and a fresh signal after return. Rules and real transport tests cover this; the specification now records the narrower rule. |
| B-02: abandoned game has no exit | Game menu retains a resumable seat. The disconnect overlay also offers Leave this night, which forgets the credential and returns to title; reload stays there and a new night can be created. |
| B-03: reopened links lose seats or collide with another tab | Fresh tabs can join separate seats in one browser profile. Resume uses the invitation's matching remembered credential. A full-room code join recovers a remembered seat. Tests cover both forms and returning to an older room. |
| B-04: network switch waits for heartbeat expiry | A valid private token immediately replaces the old socket. The older tab is told play continued elsewhere and suppresses automatic reclaiming. Real TCP interruption tests recover automatically and through Resume within a five-second assertion window. This is a local check, not a public-network latency guarantee. |
| C-01: landscape hides required play controls | The objective and story/signal actions are inside the scene. The scene and objective are fully visible at 844×390; direct taps complete the flashlight step without scrolling. Safe-area spacing is included but requires physical-phone checks. |
| F-04: unreadable play text | Scene objective/action text is 14 px, quick transmissions 13 px, role/caption text 12 px and radio entry 16 px. Other presentation typography awaits the visual pass. |
| C-03: refresh leaves audio locked | Subsequent game interactions attempt to resume optional audio; rejected audio promises remain harmless. Ambient sound and real iPhone audio are still pending. |

The previous commit already addressed F-01 scene interactions, B-05 terminal failed rejoin, clipboard fallback, and lobby exit. This pass adds held-press regressions, immediate token recovery and the stronger landscape objective check.

## Remaining work, in order

1. B-06: require deliberate cooperation throughout route/passage steps and gently discourage guessing. Phase changes now invalidate stale beams, but the standalone route and repeated guesses still need a rules pass.
2. F-03: three distinct hint levels and an explicit automatic nudge. The opening hint has been updated for the new visibility behavior.
3. E-01/A-01: prepare a production runtime that does not depend on development packages; disable inspection by default outside deliberate development. Public deployment remains deferred under the current local-only instruction. No hosting provider has been selected or tested.
4. B-07: measure clock/transition alignment under asymmetric latency before making a public-network timing claim.
5. F-02 and the moving figure: painted 2.5D reference scene, actual darkness/reveal, final typography, animation and sound. No art redesign in this pass.
6. F-05/H-02/H-03/D-01/E-02: ending-vote clarity, unused bookkeeping, template cleanup, serving and deployment-origin configuration.

Both orientations remain supported. Fullscreen and home-screen guidance are optional conveniences, not prerequisites for play. Real iPhone/Android testing, Safari, native keyboard and touch gesture behavior, audio output, public-network recovery and first-play pacing remain release checks.

## Validation

See [FLOW_VERIFICATION.md](FLOW_VERIFICATION.md) for commands and final results. Browser tests use real multiplayer; simulated visibility/composition and optional-permission failures are labeled explicitly.
