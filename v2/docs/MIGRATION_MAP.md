# V2 Migration Map — original 3D preserved

The file `apps/player/game.html` is copied byte-for-byte from the supplied V21 ULTRA 4D HTML source. V2 does **not** edit, delete, simplify, replace, or redraw its Three.js scene, bowl, dice, chips, camera, lighting, animation, audio, or visual UI.

The V2 layer is injected from the parent page through `bridge.js` after the original game has loaded.

| Original surface | V2 behavior |
|---|---|
| `init3D()` | Still executed by the original game. V2 does not replace it. |
| Three.js scene / bowl / dice / chips | Preserved. Server events only provide authoritative dice values and phase timing. |
| `animateShakeDice()` | Original animation is called with the server-provided dice values. |
| `forceOpenBowl()` | Original bowl-opening animation is retained. Its final callback is redirected to the server settlement display. |
| `placeBet()` | UI entry point is wrapped by `bridge.js`; money movement happens on the server. |
| `clearBets()` / `doubleBets()` / `reBet()` | Wrapped so coin mutations are server-side. |
| `userBalance` | Display-only mirror of the PostgreSQL balance. |
| `currentBets` | Display-only mirror of server-open bets. |
| `finishPeekingPhase()` | Server settlement result is displayed without client-side payout. |
| local `Math.random()` game results | No longer authoritative. Server uses `crypto.randomInt()` for round dice. |
| bots/chat/visual effects | Existing visual systems remain untouched. |

## Authority model

**Server:** round state, dice result, bet acceptance, coin balance, settlement, admin configuration.

**PostgreSQL:** users, characters, coin ledger, rounds, bets, audit log, game configuration.

**Client:** 3D rendering, input, animation, display. It is never trusted for balance or result.
