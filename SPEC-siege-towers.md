# Spec: siege-towers

Status: DRAFT (awaiting review)
Module: `siege-towers` (see "Next up" in [`CAPABILITIES.md`](CAPABILITIES.md) and [`tasks/roadmap.md`](tasks/roadmap.md)). Builds on `tower-aiming` ([`SPEC-tower-aiming.md`](SPEC-tower-aiming.md)), `line-of-sight` ([`SPEC-line-of-sight.md`](SPEC-line-of-sight.md)), `balance-files` ([`SPEC-balance-files.md`](SPEC-balance-files.md)) and `town-lights` ([`SPEC-town-lights.md`](SPEC-town-lights.md)).
Last updated: 2026-10-27

## Assumptions (correct these before approval)

1. **Enemies get armour.** Today only units have armour. For the crossbow's "ignores armour" to mean anything, enemy kinds get an `armour` number too (0 for most; golems, thanes, rams and marine captains have some). Every hit takes armour off its damage, never below 1, as units already do. This is a balance change, and it's tuned in the balance file.
2. The four new structures go in the build picker's Defence tab, and `.items` files can limit them like anything else.
3. All numbers below are starting points, to be tuned with the balance panel.
4. Wall spikes are removed (George: floor spikes do the same job). In old `.map` files they become plain walls, so the maze stays the same; in old `.items` files the entry is dropped.

## Objective

More medieval ways to defend, each with a clear job, so the choice of tower matters:

1. **Ballista:** a huge bolt that goes straight through a line of enemies. Very powerful, very slow to fire and to turn. Best down a long straight corridor.
2. **Crossbow tower:** slower than an archer, hits harder, and ignores armour. The answer to golems and armoured leaders.
3. **Burning oil:** built only on a wall or gate. It pours burning oil on enemies close to its wall, and they keep burning for a few seconds. The answer to enemies hacking at your walls. It glows at night.
4. **Caltrops:** a cheap floor trap that slows enemies crossing it. Works best in front of towers.

As a player, I can build each one, see from its hover info and overlay what it does, and see its effect on enemies (bolts flying through a line, burning enemies, slowed enemies).

## Rules

### Ballista

| | |
|---|---|
| Layer | Mount (on ground or on a wall) |
| Cost / HP | 120 / 60 |
| Weapon | Direct fire (uses line of sight), turning: `turnDegreesPerSecond` 20 |
| Range | 11 (min 2) |
| Damage | 60 to the first enemy, then x0.85 for each enemy after it |
| Fire interval | 6 s |
| Pierces | Up to 6 enemies |

- When it fires, the bolt travels along its aim to its full range. Every enemy whose tile the line passes through takes damage, in order of distance, up to `pierce` enemies, each `falloff` less than the one before.
- The bolt stops at the first tile that blocks the ballista's sight class (line of sight). A ground ballista's bolt stops at a wall; one on a wall flies over.
- It fires once its aim is within the aim tolerance of its target, as turning towers do. Target choice: the visible enemy that puts the **most enemies on the line**, ties going to the one nearest the keep, so it prefers lined-up groups.
- Projectile: `bolt`, drawn as a long streak to the end of its flight.

### Crossbow tower

| | |
|---|---|
| Layer | Mount |
| Cost / HP | 45 / 45 |
| Weapon | Direct fire, fixed (no turning), 60° arc |
| Range | 7 |
| Damage | 18, ignores armour |
| Fire interval | 2 s |

- Projectile: `quarrel`, like an arrow but darker and quicker.

### Burning oil

| | |
|---|---|
| Layer | Mount, **only on a wall or gate** ("Burning oil goes on a wall") |
| Cost / HP | 60 / 40 |
| Reach | The 8 tiles around its wall tile |
| On pour | 8 damage to every enemy in reach |
| Burning | 4 damage a second for 4 s (a new pour restarts the burn; burns don't stack) |
| Pour interval | 5 s, and only when an enemy is in reach |

- Fire credit (bounty) goes to the tower's owner, including for enemies that die burning later.
- Burning oil doesn't hurt your own structures or units (it's poured outward). It does burn enemies standing on floor spikes or caltrops next to the wall.
- At night it's a light source, like a brazier (`town-lights` gets a `burningOil` light kind, warm and a little brighter than a wall).
- Line of sight doesn't apply (it pours straight down).

### Caltrops

| | |
|---|---|
| Layer | Base, walkable, never attacked (like floor spikes) |
| Cost | 8 |
| Effect | An enemy stepping on it is slowed to x0.5 speed for 2 s (refreshed while it stays on caltrops) |
| Damage | 1 per step, so the kill credit works |

- Slows don't stack: the strongest slow wins. Rams and golems (heavy) are slowed less: their slow is `x0.75` (a `heavy` multiplier, by enemy `weight`).

### Enemy status effects

- Enemies gain two timed effects: **burning** (damage per second, ticks left, who set it) and **slowed** (factor, ticks left).
- Movement multiplies speed by the slow factor. Burning damage applies once a second through `damageEnemy`, with kill credit.
- Snapshots carry burning and slowed as flags, so clients can draw a flicker (burning) and a pale tint (slowed). Hover info adds "burning" or "slowed".

### Armour for enemies

- `EnemyKind.armour` (default 0). Damage taken = `max(1, damage - armour)`, unless the attack ignores armour (`ignoresArmour` on the crossbow).
- Starting values: golem 4, battering ram 5, dwarf thane 2, barbarian chief 1, marine captain 1, everyone else 0. Variants don't change armour.
- The journal shows armour when it's above 0.

### Removing wall spikes

- `wallSpikes` goes from `STRUCTURES`, the picker, the renderer and the README.
- **Old files:** a `.map` file with `wallSpikes` loads them as `wall`, with the same position, owner and keep, and the editor's status line notes "Wall spikes are walls now". An `.items` file with a `wallSpikes` limit loads without it and notes the same. Neither is refused. A shared `LEGACY_KINDS` table in `src/sim/` holds the mapping.
- Behaviours that treat wall spikes like walls (bomber and digger targeting in `behaviours.ts`) just lose that case.
- Online: the protocol's kind numbering changes, so the protocol version is bumped.

## Out of scope

- War drum or bell tower (towers nearby fire faster): a later tower pass.
- Drawbridge (with moats, later).
- Units with status effects (burning guards), or enemies using fire.
- Upgrading towers.
- Line of sight for units.

## Data model

```ts
// src/sim/config.ts
export type ProjectileKind = "arrow" | "ball" | "stone" | "bolt" | "quarrel";
export interface TowerStats {
  ...existing,
  /** Ballista: hits up to this many enemies along its line, each `falloff` less than the last. */
  pierce?: { max: number; falloff: number };
  /** Crossbow: armour doesn't reduce its damage. */
  ignoresArmour?: boolean;
}
export interface StructureStats {
  ...existing,
  /** Only mounts on these bases (burning oil: wall, gate). */
  mountsOn?: StructureKind[];
  /** Burning oil: pours on the tiles round it. */
  pour?: { damage: number; intervalSeconds: number; burn: { dps: number; seconds: number } };
}
export interface TrapStats { ...existing; slow?: { factor: number; seconds: number; heavyFactor: number } }
export interface EnemyKind { ...existing; armour: number }

// src/sim/types.ts
interface Enemy { ...existing; armour: number;
  burning: { dps: number; ticks: number; by: PlayerId | null } | null;
  slowed: { factor: number; ticks: number } | null }

// src/sim/effects.ts (or status.ts, new): burn ticks, slow expiry
export function updateStatus(state: GameState): void;
```

Every new number (`pierce`, `pour`, `slow`, `armour`) is part of the balance file's field list automatically (it's derived from config).

## Commands

Unchanged. No new dependencies.

## Project structure

- `src/sim/config.ts`: the four structures, `armour` on enemy kinds; `wallSpikes` removed.
- `src/sim/towers.ts`: pierce firing and target choice, ignoring armour.
- `src/sim/oil.ts` (new) or `towers.ts`: pouring. `src/sim/traps.ts`: caltrops' slow.
- `src/sim/status.ts` (new): burning and slowed. `src/sim/enemies.ts`: armour in `damageEnemy`, slowed speed in movement.
- `src/sim/grid.ts`: `mountsOn` in `canBuild`.
- `src/sim/mapFile.ts`, `src/sim/itemsFile.ts`: legacy kinds.
- `src/render/palette.ts`, `src/render/canvas.ts`, `src/render/lights.ts`: glyphs, projectiles, status tints, the oil light. `src/ui/state.ts`: picker. `src/ui/tileInfo.ts`, `src/ui/journalView.ts`: hover and journal lines. `src/audio`: cues for a bolt and a pour.
- `src/net/protocol.ts`: version bump; snapshots carry status flags.
- Tests: `tests/sim/ballista.test.ts`, `tests/sim/oil.test.ts`, `tests/sim/status.test.ts`, additions to `tests/sim/traps.test.ts`, `tests/sim/towers.test.ts`, `tests/sim/mapFile.test.ts`, `tests/sim/itemsFile.test.ts`; wall-spike tests removed or turned into wall tests.

## Code style

As `towers.ts` and `traps.ts`: stats from `state.balance`, a cue per visible event, effects pushed for the renderer, every random roll through the state RNG.

## Testing strategy

- **Ballista:** three enemies in a line take 60, 51 and 43; a seventh enemy on the line is untouched with `max` 6; a wall stops a ground ballista's bolt and doesn't stop one on a wall; it turns at 20° a second; it picks the target that lines up the most enemies.
- **Crossbow:** against a golem (armour 4) it deals its full 18, where an archer's 6 becomes 2; it never turns.
- **Burning oil:** can't be built on the ground or on a house ("Burning oil goes on a wall"); pours only with an enemy in reach; burn damage over 4 s matches; a new pour restarts and doesn't stack the burn; kill credit for an enemy that dies burning; it doesn't hurt the owner's structures.
- **Caltrops:** an enemy crossing is at half speed for 2 s; a golem at x0.75; slows don't stack.
- **Armour:** damage taken is `max(1, damage - armour)`; units' armour is unchanged.
- **Wall spikes:** an old map with wall spikes loads them as walls; an old items file loads without the entry; neither is refused.
- **Determinism:** the 2,000-tick test with every new tower.
- Browser, by hand: a ballista shot through a corridor of goblins; burning enemies at a wall at night; caltrops in front of archers.

Coverage for `src/sim/` stays at 80% lines or more.

## Boundaries

- **Always:** numbers in config, so they're tunable in the balance file; use `canSee` for direct fire; kill credit through `damageEnemy`.
- **Ask first:** enemy armour values above 5; status effects on units; removing floor spikes as well.
- **Never:** refuse an old file because it has wall spikes; let burning oil be built off a wall.

## Success criteria

1. All four structures can be built, do what their tables say, and are tunable in the balance panel.
2. The ballista pierces a line of enemies and is stopped by walls exactly as line of sight says.
3. Burning and slowed enemies are visible in play and in hover info, solo and online.
4. Wall spikes are gone, and old `.map` and `.items` files still open.
5. `npm run typecheck`, `npm test`, `npm run coverage` (80%+ for `src/sim/`) and `npm run build` pass.

## Open questions

1. Enemy armour: fine to add here (proposed), or keep the crossbow simpler (long range, high damage, no armour rule)?
2. Glyphs: ballista `⇶` or `Ψ`, crossbow `⊥`, burning oil `♨`, caltrops `⁂`? (To check against Unifont coverage.)
3. Should the ballista be allowed only on walls, to make it a "castle" weapon? Proposed: anywhere, with line of sight doing the work.
4. Does burning oil burn floor spikes' and caltrops' tiles for a while (a burning patch), or only the enemies it hits? Proposed: only enemies.
