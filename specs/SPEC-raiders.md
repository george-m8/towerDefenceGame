# Spec: raiders

Status: FIRST BUILD (2026-10-28): a fast playable version; see "First build" for what's still to do
Module: `raiders` (enemy mode). Builds on `players`, `game-server`, `lobby`, `enemy-kinds`, `enemy-pathing` and `unit-core`. Pad controls build on `controllers` (`feat/controllers`, not yet merged into `dev`): until it lands, raiders play with keyboard and mouse only.
Last updated: 2026-10-28

## Objective

Some players play **the enemy**. A raider takes over one enemy on the map: same kind, variant, HP, speed, damage and abilities as any other of its kind, but it goes where the raider points and hits what the raider tells it to. When that enemy dies, the raider takes over the nearest other enemy. A switch button jumps them into another enemy at random, and the one they leave carries on by itself as an ordinary enemy. A few goblins always roam the map in games with raiders, so there is always someone to be, even by day or between waves.

The defenders play Endless (or a campaign level) as they do today. The raiders win if the keep falls.

**Player-facing outcome:** in an online room, one player picks **Raider** in the waiting room. The game starts and they're one of the goblins roaming the map, with the camera on them. They point at a gap in the defender's maze and the goblin walks there; they point at a wall and press A, and the goblin walks up and hacks at it. A tower kills it, and two seconds later they're the nearest enemy, a zerg in the same wave. They press Y and land in a dwarf bomber on the other side of the map, hold sprint and run it into a tower.

### User stories

1. As a raider, I control one enemy at a time with the pointer (mouse or left stick) and one button to act.
2. As a raider, my enemy has exactly the stats and abilities of its kind. I get no extra HP, speed or damage.
3. As a raider, when my enemy dies I become the nearest other enemy soon after, without doing anything.
4. As a raider, I can press switch to jump into another enemy at random. The one I leave goes back to acting on its own.
5. As a raider, there's always an enemy for me to be, day or night, during a wave or between waves.
6. As a defender, a raider-controlled enemy looks and dies like any other, with a mark so I can tell it's a person.
7. As a raider, the game tells me who won: the keep fell (raiders win), or the level was beaten (defenders win).

## Rules

**Roles**

- Each player has a `role`: `defender` (default) or `raider`. It's picked in the waiting room and fixed once the game starts.
- Raiders exist only in Endless (including night spawns and campaign levels). PvP has no waves, so it offers no raider role.
- A game needs at least one human defender to start. Up to `RAID.maxRaiders` (starting value 2) of the room's 4 players can be raiders.
- Raiders can't build, sell, send waves or vote to skip to night. Those commands are refused: `{ ok: false, reason: "Raiders can't build" }` and so on. Raiders do vote on pause and fast-forward, as every connected player does.
- Raiders have no gold. Bounties for killing their enemies go to defenders as usual.

**Roaming goblins**

- In a game with at least one raider, `RAID.roamers` (starting value 5) **roaming goblins** are always on the map, day and night, during waves and between them. Whenever fewer are alive, a new one spawns at a random spawn tile, at most one every `RAID.roamerSpawnSeconds` (starting value 3 s).
- A roamer is a goblin grunt at wave 1 stats (no wave scaling, standard variant), with the normal goblin bounty.
- Left to itself, a roamer **roams**: it picks a random tile it can reach within `RAID.roamRadius` (starting value 8) tiles, walks there, pauses `RAID.roamPauseSeconds` (1 s), and picks again. It never attacks by itself. It fights back only as any enemy does when a unit blocks it. Towers and traps attack it like any enemy.
- Taken over by a raider, a roamer is an ordinary controlled goblin. Let go, it goes back to roaming.
- Roamers don't count towards a wave: they aren't in the threat budget, and a level's last wave counts as beaten with roamers still alive (`lastWaveBeaten` ignores them).
- A game with no raiders (or whose raiders have all dropped out for good) has no roamers. When the last raider drops out, roamers stop spawning. Those alive stay and roam.

**Taking an enemy (possession)**

- An enemy has a `controller`: the raider controlling it, or `null` (its own AI, as today). An enemy has at most one controller and a raider controls at most one enemy.
- **Start:** when the game starts, each raider takes the nearest uncontrolled enemy to the spawn strip's centre (a roamer, since the roamers spawn first). Raiders take theirs in player-id order.
- **Respawn:** when a raider's enemy dies (killed, exploded, or removed at the end of a tick), they wait `RAID.respawnSeconds` (starting value 2 s), then take the **nearest** living, uncontrolled enemy to the tile where they died, of any kind, wave enemy or roamer. Distance is straight-line; ties go to the lowest id. Roamers mean there's nearly always one. If there isn't, they wait until one spawns.
- **Switch:** the `switchEnemy` command takes the raider into a random living, uncontrolled enemy anywhere on the map, chosen with the state RNG. It never picks the enemy they're in or the one they've just left, unless there's no other. There's no range limit. If there's no other enemy, it's refused: `{ ok: false, reason: "No other enemy to take" }`.
- **Letting go:** the enemy a raider leaves (by switching or dropping out) goes back to its AI at its next tile centre: `mode` back to `walking`, `targetId` and its order cleared. A wave enemy picks up its profile's field from where it stands. A roamer goes back to roaming. Nothing else about it changes.
- A raider who drops out lets go of their enemy at once. When they rejoin, they take the nearest uncontrolled enemy to the spawn strip's centre, with no respawn delay.

**Moving (the pointer)**

- The raider's pointer (mouse, or left stick and d-pad once `controllers` is in) gives a **target tile**. The client sends `steer` whenever the tile under the pointer changes, never more than 10 a second. When the pointer leaves the map, the last target stays.
- A controlled enemy walks to its target tile along a short path: a breadth-first search over tiles its **movement profile** can cross (so marines can use rivers and the sea, nobody else can), round structures and the keep. Enemies can share tiles, as today. The search covers at most `RAID.searchTiles` (starting value 400) tiles and is redone when the target or `gridVersion` changes.
- If the target can't be reached, the enemy walks to the reached tile closest to it (straight-line) and stops there.
- It moves at its own speed. A controlled enemy never wanders, never follows its flow field and never attacks by itself. Passive abilities still run: a shaman's heal and farmland trampling happen as for any enemy.

**Sprinting**

- A controlled **bomber** (`x`, `X`) sprints (its ability's `sprint` multiplier, 2.5x) whenever the raider holds `sprint`, and also on its way to blow something up (below). The client sends `sprint { on }` when the button goes down and up.
- No other kind has a sprint. For them the button does nothing and the HUD doesn't show it.

**Interacting (the act button)**

- `interact` names a tile. What's on it decides what the enemy does, the same interaction its kind already has:

| On the tile                                        | Followers, breachers, marines, leaders                                                                        | Bomber (`x`, `X`)                            | Digger (`n`)                                                              | Ram (`R`)                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- | --------------------------- |
| Wall, gate, tower, house or other player structure | Walk beside it and attack it each interval (the wall first if a tower stands on it, as `attackTargetAt` does) | Sprint beside it and explode (3x3, as today) | Walls and wall spikes: walk beside it and dig under it. Others: attack it | Attack it                   |
| The keep                                           | Walk beside it and attack it                                                                                  | Sprint beside it and explode                 | Attack it                                                                 | Attack it                   |
| A player unit                                      | Walk to it and fight it, following it while it moves                                                          | Sprint to it and explode                     | Fight it                                                                  | Refused (rams ignore units) |
| Its own tile                                       | Nothing                                                                                                       | Explode where it stands                      | Nothing                                                                   | Nothing                     |
| Anything else                                      | Same as `steer` to that tile                                                                                  | Same                                         | Same                                                                      | Same                        |

- "Beside" means one of the 4 tiles next to it, the way enemies attack today. A marine in water can't attack: it walks to a land tile beside the target first, or stops if there isn't one in reach.
- The enemy keeps at its interaction until the target is gone (destroyed, sold or dead), the raider steers elsewhere, or the raider presses cancel. Then it stands where it is until steered.
- Interacting with ruins, bridges or floor spikes is refused, as the AI never targets them. A bomber's target needs no sight check: the raider chose it. Its path is limited to `RAID.searchTiles` like any controlled path.

**Bands**

- A controlled chief (`B`) or thane (`D`) keeps its band. While their leader is controlled, members walk towards the leader's tile (by the same short search) instead of the field, stay within `BAND.maxLead` tiles of it, and attack whatever the leader is attacking.
- If a raider takes over a band member, it leaves the band (`leaderId` cleared for good). It doesn't rejoin when let go.

**Sight and camera**

- Raiders are one team with their own sight: `RAID.sight` tiles (starting value 5) round every living enemy, plus the spawn strip. Their explored tiles are a separate bit in `state.explored`, as PvP teams have. Defenders' fog is unchanged.
- The raider's camera follows their enemy, kept in the middle of the screen. Panning with the pan stick or arrow keys moves it away; it eases back `RAID.cameraReturnSeconds` (2 s) after the last pan. While waiting to respawn, it stays where they died. On a switch or respawn it glides to the new enemy over 0.3 s, so the raider can see where they've gone.
- Zoom works as today. The minimap shows the raider's own enemy as a brighter dot.

**Latency (online)**

- The enemy moves on the server as everything else does. There's no client-side prediction in this module.
- So steering feels immediate, the client draws the raider's target outline (and the interaction hint) as soon as the pointer moves, without waiting for the server.
- `steer` and `sprint` don't trigger the immediate update that state-changing commands get. Otherwise two raiders moving a mouse would add up to 20 full updates a second to everyone. The enemy responds on the next 10 Hz update, about 100 ms plus ping. `interact` and `switchEnemy` do trigger one.
- If playtesting shows this is too sluggish, the next step is a small per-raider update at 20 Hz carrying only their own enemy, not faster full updates. That's a follow-up, not part of this module.

**Winning**

- The keep falls: the game is over and the raiders win.
- A campaign level's last wave is beaten: the defenders win. Endless with raiders goes on until the keep falls, as Endless always has.
- The game-over screen says which side won and lists each raider's damage to structures, damage to the keep, enemies played and deaths.

**Offline**

- The Debug menu gets **Play as enemy**: a solo game with a raider and no defender. The map's own structures (from a `.map` or a level) are the defences. This is for trying kinds out and testing levels. It isn't a real mode and doesn't need the one-defender rule.

## Controls

New actions `interact`, `switchEnemy` and `sprint`. Raiders have no build menu, so they reuse the defenders' buttons. On today's `dev` the keyboard and mouse bindings go in `src/ui/input.ts`. They move into `src/ui/controls.ts` with the pad bindings when `controllers` merges.

| Action                                         | Keyboard and mouse                                                       | Switch             | Xbox     | PlayStation |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ------------------ | -------- | ----------- |
| Steer (target tile)                            | hold left click on open ground: the enemy follows the pointer while held | left stick / D-pad | same     | same        |
| `interact` (act on the tile under the pointer) | left click                                                               | A                  | A        | ✕           |
| `switchEnemy` (jump into a random other enemy) | `F` or right click                                                       | X                  | Y        | △           |
| `sprint`, held (bombers only)                  | `R`                                                                      | Y                  | X        | □           |
| `cancel` (stop the interaction)                | `Esc`                                                                    | B                  | B        | ○           |
| Pan away / zoom                                | as today                                                                 | as today           | as today | as today    |

- The HUD shows the raider's enemy (glyph, kind and variant, HP bar) and a hint line for the tile under the pointer, e.g. `A attack wall` or `A blow up tower`, plus `Y switch` and, for bombers, `X sprint`. The labels follow the device in use (`keyLabels` once `controllers` is in).
- While waiting to respawn it shows `Back in 2s`.

## Drawing, hover and network

- A controlled enemy is drawn as any enemy of its kind with an owner mark (the game's owner mark, in the raider's player colour) and, for the raider themselves, a ring under it. Its target tile shows as a faint outline for the raider only.
- Roamers are drawn as ordinary goblins.
- Hover info adds the raider's name, e.g. `Goblin brute (Sam), HP 18 / 28`, or `roaming` for an uncontrolled roamer.
- `ClientEnemy` gains `controller?: PlayerId` and `roamer?: true`, each sent only when set. `Player` (and the client's copy) gains `role`.

## First build (2026-10-28)

The first, fast playable version builds the core and leaves the rest for later.

**In:**

- Roles, with the waiting room's role button and the "Someone has to defend" rule.
- Roaming goblins.
- Possession, respawn into the nearest enemy, and random switching.
- Steering, interactions (attack, keep, units, bomber blast and self-blast, digging), and bomber sprint.
- Online: the new commands, with `steer` and `sprint` not forcing updates.
- The raider HUD, owner rings, the target outline and camera follow.
- Game over when raiders win, and the Debug menu's "Play as enemy" (offline).

**Changed from the rules above:**

- **Mouse steering is hold-to-move:** holding left click on open ground makes the enemy follow the pointer, and pressing on a target acts on it. Following the pointer all the time would cancel an attack whenever the mouse or the following camera moved.
- **Data model:** raider state is one `raid` object on `Player`. Controlled enemies and roamers share one `steer` object on `Enemy`. There's no `winningSide` field: raiders win exactly when the keep falls in a game with raiders, so the game-over screen works it out.

**Added after the first build (2026-10-29):**

- **No ring for others, a flag:** to everyone else, controlled enemies look exactly like any other (the raider themselves sees a ring in their colour round their own enemy), and clients aren't told which enemy anyone controls (`controller` isn't sent; a raider finds their own by `raid.enemyId`). The only tell is the small flag in the raider's colour left where their enemy dies, for `RAID.flagSeconds` (10 s), seen only in sight.
- **Carrying on:** after a death, the next enemy heads for the square the raider last chose, or keeps at what they last told it to act on. A bomber's blast on the spot isn't carried on.
- **Raider menu (C, or the Choose button):** lists the kinds of enemy on the map, with counts. Choosing one puts the raider in a random one of that kind (`switchEnemy` with `kind`).
- **Chosen kind sticks:** after a death the raider takes the nearest enemy of the kind they last chose. With none of that kind left, they get a random stand-in, and the first of their kind to spawn afterwards becomes them, carrying on to their target. A plain switch (F) goes back to any kind.

**Raider paths (2026-10-30, in place of the global pathing flags of 2026-10-29):**

- **Painting:** Alt+drag paints path tiles on the ground; Alt+drag starting on a painted tile rubs them out. Backspace clears them all. The raiders share one set of paths, at most `RAID.maxPathTiles` (400) tiles. Painting doesn't force an update online; updates carry the paths only when they've changed.
- **Following:** a free wave enemy (nobody's, not a roamer) that steps onto a path keeps to it until its end. Each stretch of path (4-connected painted tiles) has its own shortest-path flow, worked out within the painted tiles only, at the enemy's usual costs, and redone whenever the paths or the grid change. So it attacks a wall on the path, fights units and wanders along it, but never steps off. Bombers and diggers don't go for targets while on a path. Enemies that never step onto a path aren't drawn to one.
- **The end** of a stretch is its tile painted last, wherever that is: a path can bend near the keep and lead away again. There the enemy goes back to its own field **for good** (`pathDone`), so it never loops back along a path, nor takes another.
- **Controlled enemies** go where their raider steers them, paths or not. Roamers don't follow paths.
- **Only raiders see the paths**, as a pale wash over the painted tiles, with a small amber flag on each stretch's end (its tile painted last), so they can see where enemies will leave it.
- **Per-enemy flags stay (restored 2026-11-01):** Shift+click adds a pathing flag after the ones the raider's enemy already has: walk to a tile, or walk up to what's there and act on it. It does them in order, at most `RAID.maxFlags` (10) queued. A plain click or hold-to-move replaces them with one aim; Esc stops and drops them. After a death the next enemy carries the plan on, and an enemy the raider switches away from finishes its flags before going back to its field. Only the raider sees them: pennants in their colour, numbered in order, joined to their enemy by a dashed line.
- **Sprint stays on R** (hold).
- **Camera:** it follows the raider's enemy until they move the view away by any means (keys, dragging, the minimap; zooming doesn't count). It then stays where they put it until they take another enemy (a switch or respawn) or press V.
- A path search looks at most `RAID.searchTiles` tiles. At the end of a partial path it searches again from there, so far-off goals are reached; a goal that truly can't be reached counts as done once it's as near as it gets.

**Not yet:**

- Raider sight: raiders see the whole map for now, not 5 tiles round each enemy.
- A controlled leader's band following it. Members keep to their field.
- Game-over totals per raider.
- Hover info showing the raider's name and "roaming".
- The camera gliding on a switch.
- Pad controls (wait for `controllers`).

## Out of scope

- Raiders choosing which kind to be, or spending anything (a raider economy or wave budget).
- Raiders against PvP keeps, or raiders on both sides.
- Client-side prediction, or per-raider fast updates (see Latency).
- Sprinting for kinds other than bombers, and other new abilities for controlled enemies (dodging, calling the band).
- Bots that play raider, and defences that build themselves for a solo raider.
- Remapping the new actions (no remapping screen exists yet).

## Data model

```ts
// src/sim/types.ts
export type Role = "defender" | "raider";

export interface Player {
  ...existing;
  role: Role;
  /** Raiders: the enemy they control, if any. */
  enemyId: number | null;
  /** Raiders: the enemy they last let go of, which a switch skips. */
  leftId: number | null;
  /** Raiders without an enemy: ticks until they take the nearest one. */
  respawnIn: number;
  /** Raiders without an enemy: where they died, to find the nearest one from. */
  diedAt: Point | null;
  /** Raiders: totals for the game-over screen. */
  raid: { structureDamage: number; keepDamage: number; enemies: number; deaths: number };
}

export interface Enemy {
  ...existing;
  /** The raider controlling it; null while it acts on its own. */
  controller: PlayerId | null;
  /** A roaming goblin (games with raiders), outside the waves. */
  roamer: boolean;
  /** Controlled: where the raider is steering it. Roamers: where it's roaming to. */
  goal: Point | null;
  /** Controlled only: what the raider told it to act on (structure, unit, keep or itself). */
  order: RaidOrder | null;
  /** Controlled only: a bomber's sprint button is held. */
  sprinting: boolean;
  /** Controlled and roaming: the short path to `goal`, as units keep theirs. */
  path: Point[] | null;
  pathVersion: number;
}

export type RaidOrder =
  | { kind: "structure"; id: number }
  | { kind: "unit"; id: number }
  | { kind: "keep"; index: number }
  | { kind: "self" };

export interface GameState {
  ...existing;
  /** Ticks until another roamer may spawn. */
  roamerTimer: number;
  /** Which side won, once the game is over in a game with raiders; null otherwise. */
  winningSide: "defenders" | "raiders" | null;
}

export type Command =
  ...existing
  | { type: "steer"; x: number; y: number }
  | { type: "interact"; x: number; y: number }
  | { type: "stopInteract" }
  | { type: "sprint"; on: boolean }
  | { type: "switchEnemy" };

// src/sim/config.ts
export const RAID = {
  maxRaiders: 2,
  respawnSeconds: 2,
  searchTiles: 400,
  sight: 5,
  roamers: 5,
  roamerSpawnSeconds: 3,
  roamRadius: 8,
  roamPauseSeconds: 1,
  cameraReturnSeconds: 2, // UI only
};

// src/sim/raiders.ts (new)
export function takeEnemy(state: GameState, player: PlayerId, enemy: Enemy): void;
export function release(state: GameState, enemy: Enemy): void;
export function switchEnemy(state: GameState, player: PlayerId): CommandResult;
export function nearestFree(state: GameState, from: Point): Enemy | undefined;
export function updateRaiders(state: GameState): void; // respawns, roamer spawning
export function steerControlled(state: GameState, enemy: Enemy): void; // called from advance()
export function roam(state: GameState, enemy: Enemy): void; // called from advance()

// src/net/protocol.ts
// "create" is unchanged; the role is picked in the waiting room:
// ClientMessage | { type: "setRole"; role: Role } (refused once the game has started)
```

`advance()` in `enemies.ts` branches once: a controlled enemy runs `steerControlled`, and an uncontrolled roamer runs `roam`, instead of `BEHAVIOURS[...]` and `chooseNextTile`. The AI path for wave enemies stays as it is. The bomber, digger and attack helpers in `behaviours.ts` and `enemies.ts` are split so they take a target rather than finding one, so both paths share them.

## Commands

Unchanged: `npm run dev`, `npm run server`, `npm test`, `npm run coverage`, `npm run typecheck`, `npm run build`. No new dependencies.

## Project structure

- `src/sim/raiders.ts` (new): possession, release, respawn, switching, steering, orders, roamers
- `src/sim/types.ts`, `src/sim/config.ts`: roles, enemy fields, commands, `RAID`
- `src/sim/enemies.ts`, `src/sim/behaviours.ts`: the controlled and roaming branches; target-taking attack, bomb and dig helpers
- `src/sim/unitPaths.ts`: `findPath` takes a movement profile, so controlled enemies and roamers use it
- `src/sim/fog.ts`: the raider team's sight
- `src/sim/game.ts`, `src/sim/players.ts`, `src/sim/waves.ts`: role checks on commands, `winningSide`, release on disconnect, `lastWaveBeaten` ignoring roamers
- `src/net/protocol.ts`, `src/net/snapshot.ts`, `server/room.ts`: `setRole`, the new commands (with `steer` and `sprint` not forcing an update), `controller`, `roamer` and `role` on the wire
- `src/ui/input.ts`, `src/ui/camera.ts`, `src/ui/hud.ts`, `src/ui/waitingRoom.ts`, `src/ui/gameOver.ts`, `src/ui/tileInfo.ts`, `src/ui/minimap.ts`, `src/render/canvas.ts`: raider controls, camera follow, HUD, role picker, results, marks. `src/ui/controls.ts` and `src/ui/keyLabels.ts` once `controllers` is in.
- `tests/sim/raiders.test.ts` (new), plus updates to the `enemies`, `players`, `fog`, `waves`, `protocol` and `room` tests

## Code style

As [`SPEC.md`](SPEC.md#code-style): plain data and functions, numbers in config, state RNG for any roll. The new branches are one early `if`, so the wave-enemy AI reads as it does today:

```ts
function advance(state: GameState, enemy: Enemy): void {
  if (enemy.hp <= 0) return;
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - 1);
  const from = { x: Math.round(enemy.x), y: Math.round(enemy.y) };
  if (enemy.controller !== null) steerControlled(state, enemy);
  else if (enemy.roamer) roam(state, enemy);
  else if (!BEHAVIOURS[ENEMY_KINDS[enemy.kind].behaviour](state, enemy)) {
    walk(enemy, speedOf(state, enemy), () => chooseNextTile(state, enemy));
  }
  ...
}
```

## Testing strategy

Vitest unit tests in `tests/sim/raiders.test.ts`, written before each change, on blank maps with hand-placed structures:

- **Refactor first:** splitting attack, bomb and dig into target-taking helpers leaves the whole suite passing untouched.
- **Roles:** raiders can't build, sell, send waves or skip to night; they can vote to pause; a game with no defender can't start online; PvP refuses the raider role.
- **Roamers:** a game with a raider keeps 5 roamers alive, spawning at most one every 3 s at spawn tiles; a game without raiders has none; roamers have goblin grunt wave-1 stats; they roam within 8 tiles and never attack structures or the keep by themselves; they don't spend wave threat; a level's last wave is beaten with roamers alive.
- **Possession:** raiders start in the nearest enemies to the spawn strip, in id order; after a death the raider waits `respawnSeconds`, then takes the nearest uncontrolled enemy to where they died (ties to the lowest id), never a controlled one.
- **Switch:** it takes a random uncontrolled enemy anywhere; never the current one or the one just left while there's another choice; the same seed gives the same picks; it's refused with no other enemy.
- **Release:** a wave enemy left behind follows its field again from its tile, with mode and target cleared; a roamer left behind roams again; a dropped raider's enemy is released at once.
- **Stats:** a controlled enemy of each kind has the same HP, speed, damage and interval as an uncontrolled one of the same variant and wave; it takes damage and pays bounty the same.
- **Steering:** it walks to the target by a shortest path round walls; a goblin never enters water, a marine does; an unreachable target stops it at the closest reached tile; it never wanders or attacks by itself.
- **Sprint:** a bomber holding sprint moves 2.5x as fast and stops sprinting on release; sprint does nothing for other kinds.
- **Interactions:** a follower attacks the wall (not the tower on it) when told to attack the tower's tile; a bomber sprints and explodes at its target, damaging the 3x3; a bomber told to act on itself explodes on the spot; a digger digs under a wall and attacks a house; a ram refuses a unit; the interaction stops when the target falls or the raider steers away.
- **Bands:** a controlled chief's band follows him off the field and attacks his target; a taken-over band member leaves the band for good.
- **Sight:** raider sight covers 5 tiles round every enemy; defender sight is unchanged by raiders.
- **Winning:** the keep falling sets `winningSide: "raiders"`; beating a level's last wave sets `"defenders"`.
- **Determinism:** the same seed and command list (with `steer`, `interact`, `sprint` and `switchEnemy` from two raiders) gives the same state after 2,000 ticks, run twice.
- **Network:** `setRole`, the new commands, and `controller`, `roamer` and `role` survive validation and snapshot round trips; malformed ones are rejected; `steer` and `sprint` don't force an update, `interact` and `switchEnemy` do; the 200-enemy update size test still passes.
- Coverage stays at 80% lines or more for `src/sim/`, `src/net/` and `server/`.

Browser checks: one raider and one defender online on a generated map (steering with the mouse, attacking a wall, a bomber sprint and blast, a death and respawn into the nearest enemy, a switch); by day with night spawns, raiding as a roamer; a raider chief leading a band; Play as enemy on a campaign level. Pads once `controllers` is in.

## Boundaries

- **Always:**
  - Give controlled enemies their kind's stats and profile, never better ones.
  - Validate every raider command on the server: role, the enemy's controller, reachability.
  - Keep one code path for each interaction, shared by the AI and raiders.
  - Update the README and SPEC.md ("Since `raiders`").
- **Ask first:** giving raiders anything uncontrolled enemies don't have; changing wave budgets for games with raiders; per-raider fast updates or prediction; new dependencies.
- **Never:** let a raider control an enemy the server didn't hand them; trust an enemy id or position from a client; change how wave enemies behave because raiders are in the game.

## Success criteria

1. An online room with one defender and one raider plays through. The raider controls one enemy at a time with the mouse, or with a pad once `controllers` is in. The defender plays as in Endless.
2. A controlled enemy moves where it's pointed, over its kind's terrain, and attacks, explodes or digs on command, exactly as its kind does. Bombers sprint while sprint is held.
3. After a death, the raider is in the nearest other enemy `respawnSeconds` later.
4. Switch jumps into a random other enemy, and the enemy left behind carries on as an ordinary enemy (or roamer).
5. In a game with raiders, 5 roaming goblins are always on the map, and they don't stop a level being won.
6. Game over names the winning side.
7. Single-player Endless and PvP are unchanged: all existing tests pass.
8. `npm run typecheck`, `npm test`, `npm run coverage` and `npm run build` pass.

## Resolved decisions

1. **Name:** Raiders.
2. **A human defender is needed.** Solo "Play as enemy" is a Debug-menu test tool only.
3. **Respawn** is into the nearest living, uncontrolled enemy to where the raider died. **Switching** jumps to a random other enemy anywhere, with no range limit.
4. **Latency:** no prediction for now. The target outline is drawn locally at once. `steer` and `sprint` don't force extra full updates. Per-raider fast updates are the follow-up if playtesting finds it sluggish.
5. **Bombers sprint whenever** the sprint button is held.
6. **Roaming goblins:** in games with raiders, 5 basic goblins always roam the map, day and night, respawning as they die, so raiders always have someone to be.

7. **Roamers left alone wander** and never attack by themselves.

## Open questions

None.
