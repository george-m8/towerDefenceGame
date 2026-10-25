# Spec: enemy-kinds

Status: APPROVED (2026-10-25)
Module: `enemy-kinds` (see "Armies" in [`CAPABILITIES.md`](CAPABILITIES.md)). First Armies module; builds on `core`, `players` and `net-client`.
Last updated: 2026-10-25

## Objective

Waves stop being one kind of enemy. Enemies come from a config table of **kinds**, and each one spawns as a **variant** of its kind, so a wave mixes fast fragile wolf riders, hordes of zergs, barbarian warbands and the odd golem, and no two goblins are quite the same. Enemies hit with their own attack stats, and those that reach the keep **stand and attack it** until they're killed.

All kinds still use today's AI (follow the open route, break walls only when sealed in, wander a little). Different AI arrives in `enemy-pathing`. Edge spawns and group waves arrive in `wave-director`. Until then a stopgap mixes the kinds into today's waves.

**Player-facing outcome:** wave 1 plays like today: 8 goblins, a couple of them visibly smaller (runts) or larger (brutes). From wave 3 zergs appear, then wolf riders, barbarians, dwarves and, from wave 10, golems. Hovering an enemy shows `Goblin brute, HP 18 / 28`. An enemy at the keep keeps hitting it, so leaking even a few enemies now matters.

### Roster

Stats at wave 1, before variants. Speed is in tiles per second. A hit happens every `interval` seconds, against a structure in the way or the keep.

| Glyph | Kind | HP | Speed | Damage / interval | Bounty | Threat | From wave | Character |
|---|---|---|---|---|---|---|---|---|
| `g` | Goblin | 20 | 1.5 | 5 / 1.0s | 2 | 1 | 1 | Today's enemy. Weak all round, cheap. |
| `z` | Zerg | 6 | 1.8 | 2 / 0.6s | 1 | 0.4 | 3 | Tiny and cheap, comes in numbers. |
| `w` | Wolf rider | 14 | 3.0 | 4 / 0.8s | 3 | 2 | 4 | Fast and fragile. |
| `b` | Barbarian | 30 | 1.8 | 4 / 0.6s | 3 | 2 | 5 | Quick hits, tougher than goblins. |
| `d` | Dwarf | 45 | 1.0 | 8 / 1.2s | 4 | 3 | 6 | Slow, solid mid-strength hits. |
| `B` | Barbarian chief | 90 | 1.2 | 8 / 0.5s | 10 | 6 | 7 | Leader: slow, lots of HP, very fast attacks. |
| `D` | Dwarf thane | 120 | 0.9 | 14 / 1.2s | 12 | 8 | 9 | Leader: stronger dwarf. |
| `G` | Golem | 250 | 0.6 | 40 / 3.0s | 20 | 15 | 10 | Rare, slow, huge HP, slow crushing hits. |

- **Wave scaling** is unchanged and applies to every kind: HP x (1 + 0.15 x (wave - 1)), bounty +1 every 5 waves.
- `B` and `D` are leaders by name only for now. Followers staying with them arrives in `enemy-pathing`.
- Later modules add rows (`x`/`X` bombers, `m`/`M` marines, `s` shaman, `R` ram, `n` diggers) with their behaviours.
- All numbers are starting values in config, tuned at Checkpoint A and B.

### Variants

Each kind lists one or more variants: a name, a weight (how often it's rolled), stat multipliers (HP, speed, damage) and a glyph size (small, normal or large). Variants are told apart by size only, never by colour: every variant of a kind is drawn in the kind's colour. Capital versus lower case is kept for separate kinds (`b` barbarian, `B` chief). An enemy rolls its variant once, when it spawns, using the state RNG.

| Kind | Variants (weight: HP / speed / damage, size) |
|---|---|
| Goblin | runt (3: 0.7 / 1.15 / 0.8, small), grunt (6: 1 / 1 / 1), brute (1: 1.4 / 0.9 / 1.3, large) |
| Zerg | drone (1: 1 / 1 / 1) |
| Wolf rider | scout (2: 0.8 / 1.1 / 0.9, small), raider (3: 1 / 1 / 1) |
| Barbarian | raider (3: 1 / 1 / 1), berserker (1: 0.8 / 1.1 / 1.4, small) |
| Dwarf | miner (2: 1 / 1 / 0.9, small), warrior (3: 1 / 1 / 1), ironclad (1: 1.4 / 0.85 / 1, large) |
| Barbarian chief | warlord (1: 1 / 1 / 1) |
| Dwarf thane | thane (1: 1 / 1 / 1) |
| Golem | stone (3: 1 / 1 / 1), iron (1: 1.3 / 0.9 / 1.2, large) |

Stats are copied onto the enemy at spawn (kind x variant x wave scaling) and never looked up again.

### Attacking

- **Structures:** an enemy whose path step is blocked hits the blocking structure for its damage, once per interval. This replaces the fixed 5 damage per second.
- **The keep:** an enemy whose next path step is a keep tile stops on its current tile and hits the keep for its damage, once per interval, until it dies. It no longer vanishes. The `keepHit` cue fires on each hit (the audio side already throttles it).
- **Keep HP** rises from 99 to **300** as a starting value, to make up for enemies staying. This is the main thing reviewed at Checkpoint A. PvP keep HP (300) is unchanged.
- An enemy attacking the keep can still be killed by towers and traps as usual.

### Stopgap wave mix (deleted by `wave-director`)

- Each wave has a **threat budget** equal to today's enemy count (5 + 3 x wave), so wave 1 is 8 threat.
- Enemies are drawn one at a time, at the usual 0.5 s spacing, from the kinds unlocked by this wave number whose threat fits in what's left of the budget. Each kind's chance of being drawn is set by a config weight. The wave ends when nothing fits.
- Goblins alone make wave 1 and 2 exactly today's 8 and 11 goblins.
- Spawning still uses the existing spawn strip.

### Drawing, hover info and network

- Each kind is drawn with its own glyph and colour. The variant sets the glyph size: small (75%), normal or large (125%), centred on the tile; the large size stays inside the tile. Kind colours and the size scales live in `src/render/palette.ts`.
- Hover info shows `<Kind> <variant>, HP x / y`, e.g. `Goblin brute, HP 18 / 28`. Kinds with a single variant show just the kind name.
- Snapshots and updates carry `kind` and `variant` as small integers (index into the config tables). The client looks up names, glyphs and colours. Server and client are always built together, so there's no protocol version handshake.
- The minimap keeps one enemy dot colour.

### Dev tools

- `E` (dev server only) spawns one enemy of the next kind in roster order each press, cycling through every kind, so each is easy to look at. `M` (200 enemies) stays goblins.
- `debugSpawn` gains an optional `kind`.

## Out of scope

- Any new AI: breachers, marines, bombers, leaders and followers, healers, rams, diggers (`enemy-pathing`)
- Choosing houses or towers as targets (`enemy-targeting`)
- Group waves and edge spawns (`wave-director`)
- The monster journal (`bestiary`)
- Enemy armour, and enemies fighting player units (`units`)

## Data model

```ts
// src/sim/config.ts
export type EnemyKindId = "goblin" | "zerg" | "wolfRider" | "barbarian" | "dwarf"
  | "barbarianChief" | "dwarfThane" | "golem";

export interface EnemyVariant {
  name: string;
  weight: number;
  hp: number; speed: number; damage: number; // multipliers
  size: "small" | "normal" | "large"; // glyph size; variants never change colour
}

export interface EnemyKind {
  glyph: string;
  name: string;
  hp: number;
  speed: number;          // tiles per second
  damage: number;         // per hit, structures and keep
  attackInterval: number; // seconds between hits
  bounty: number;
  threat: number;         // wave budget cost
  firstWave: number;
  mixWeight: number;      // stopgap mix only
  variants: EnemyVariant[];
}

export const ENEMY_KINDS: Record<EnemyKindId, EnemyKind>;
export const ENEMY_KIND_ORDER: EnemyKindId[]; // roster order; index = wire id
// ENEMY keeps wanderChance; baseHp, speed, keepDamage, structureDps, baseBounty move into ENEMY_KINDS.goblin.

// src/sim/types.ts
export interface Enemy {
  ...existing,
  kind: EnemyKindId;
  variant: number;        // index into ENEMY_KINDS[kind].variants
  speed: number;          // resolved at spawn
  damage: number;         // resolved at spawn
  attackInterval: number; // ticks, resolved at spawn
}

// src/sim/enemies.ts
export function spawnEnemy(state: GameState, x: number, y: number,
  kind?: EnemyKindId, wave?: number): Enemy; // rolls the variant; defaults: goblin, wave 1

// src/net/protocol.ts
export type ClientEnemy = Pick<Enemy, "id" | "x" | "y" | "hp" | "maxHp"> & { kind: number; variant: number };
```

## Commands

Unchanged:

```
npm run dev        # play locally
npm run server     # online server (tsx watch)
npm test           # vitest
npm run coverage   # 80%+ lines for src/sim/
npm run typecheck
npm run build
```

No new dependencies.

## Project structure

- `src/sim/config.ts`: `ENEMY_KINDS`, `ENEMY_KIND_ORDER`, keep HP
- `src/sim/enemies.ts`: spawning with kind and variant, per-enemy speed, attacking structures and the keep
- `src/sim/waves.ts`: the stopgap mix
- `src/net/protocol.ts`, `src/net/snapshot.ts`, `src/net/view.ts`: kind and variant on the wire
- `src/render/palette.ts`, `src/render/canvas.ts`: glyph and colour per kind, glyph size per variant
- `src/ui/tileInfo.ts`: hover line; `src/ui/input.ts`: `E` cycles kinds
- `tests/sim/enemies.test.ts`, `tests/sim/waves.test.ts`, `tests/net/*`: new and updated tests

## Code style

Match the existing sim code: config rows, small pure functions, state RNG for every roll.

```ts
/** Rolls a variant by weight, using the state RNG so online games stay in sync. */
function rollVariant(state: GameState, kind: EnemyKind): number {
  const total = kind.variants.reduce((sum, v) => sum + v.weight, 0);
  let roll = nextRandom(state) * total;
  for (let i = 0; i < kind.variants.length; i++) {
    roll -= kind.variants[i].weight;
    if (roll < 0) return i;
  }
  return kind.variants.length - 1;
}
```

## Testing strategy

Vitest unit tests in `tests/sim/`, written before each change, on `createGameWithoutWaves` games:

- **Refactor first:** with the goblin grunt as today's numbers, the existing suite passes before keep attacking changes. Tests that use `ENEMY.speed`, `ENEMY.keepDamage` and so on read the goblin row instead (mechanical swap).
- **Stats at spawn:** each kind spawns with its HP, speed, damage and interval, multiplied by its variant and wave scaling; changing config after spawn doesn't change an existing enemy.
- **Variants:** the same seed gives the same variants; over 10,000 rolls each variant's share is within 2% of its weight.
- **Speed:** a wolf rider crosses 10 tiles in half the ticks a goblin needs (allowing for its variant).
- **Structures:** a golem hits a wall for 40 every 3 s; a zerg for 2 every 0.6 s.
- **Keep:** an enemy next to the keep stays and hits it once per interval until killed; killing it stops the hits; the keep falls (game over) from enemies standing at it.
- **Stopgap mix:** waves 1 and 2 are all goblins with today's counts; no kind appears before its first wave; a wave's total threat never exceeds its budget; the same seed gives the same wave.
- **Network:** kind and variant survive snapshot and update round trips; the existing 200-enemy update size test still passes.
- **Regression:** everything else passes. Coverage stays at 80% lines or more for `src/sim/`.

Browser checks: a goblin-only game with enemies standing at the keep (Checkpoint A); every kind via `E`; a mixed wave online with two clients.

## Boundaries

- **Always:** keep every number in config; roll everything through the state RNG; copy stats at spawn; update README (enemy table, keep behaviour, keep HP) and SPEC.md ("Since `enemy-kinds`").
- **Ask first:** changing the roster or the keep rule beyond tuning numbers; new dependencies; changing tower targeting.
- **Never:** use `Math.random` in the sim; look up kind stats every tick; send names or colours over the network.

## Success criteria

1. Every enemy has a kind and a variant, rolled deterministically, with stats copied at spawn.
2. All eight kinds in the roster exist with their glyphs and colours, and appear in waves from their first wave through the stopgap mix.
3. Waves 1 and 2 are exactly today's goblin counts.
4. Enemies hit structures and the keep with their own damage and interval; enemies at the keep stay until killed.
5. Hover info shows kind, variant and HP; online clients see the same kinds and variants as the server.
6. `npm run typecheck`, `npm test` and `npm run coverage` (80% or more for `src/sim/`) pass.

## Open questions

None.

## Resolved decisions

1. **Keep HP** starts at 300 with enemies staying at the keep; tuned at Checkpoint A.
2. **Leaders before followers:** `B` and `D` appear on their own in the stopgap mix until `enemy-pathing` gives them followers.
3. **Variants are shown by glyph size** (small, normal, large), not by colour. Capital versus lower case marks separate kinds.
