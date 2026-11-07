# Spec: Journey home

Status: FIRST BUILD (2026-11-01): solo, playable; see "Still to do"
Module: `journey` (a game mode). Builds on `fog-of-war`, `enemy-pathing`, `raiders` (roaming, short paths) and `build-zone`.
Last updated: 2026-11-01

## Objective

A solo mode about getting somewhere rather than holding somewhere. Your **camp** starts on the far left edge of the map, and the keep you're heading for is somewhere on the right edge. Swarms of enemies wait across the map. They're idle until they see you, and then they come for you. You move the camp a hop at a time to land it can see, and build round it to survive what comes.

**Player-facing outcome:** pick Solo, then Journey home. The map opens on a small tent in your colour at the left edge, with the keep shown far off on the right. You press C and click a tile at the edge of what the camp sees. The tent packs up, walks there and pitches again, and the fog lifts round it. Three goblins at the edge of sight look up and come running, and the archer tower you put up beside the tent drops them. You move on.

## Rules

**The map**
- Generated as for Endless, but with the keep (home) one tile in from the right edge and the clear spawn strip on the left round the camp, each at a seeded height. Map generation guarantees every walkable tile can reach the keep, so the camp can always get home. There's no spawn strip in play and there are no starter walls. Hand-made maps can't be Journey home maps yet.
- Home and the ground round it are explored from the start.

**The camp**
- The game's one keep: a single tile in the player's colour, `▲` when pitched and `△` when packed. It has `JOURNEY.campHp` (200) HP, and enemies come for it and hit it as they would a keep. At 0 the game is lost.
- It sees `JOURNEY.campSight` (8 tiles clearly, 12 dimly), from wherever it is. What it sees is explored.
- `moveCamp {x, y}`: the tile must be in sight now, open walkable ground with nothing built on it (or a built bridge), and reachable over such ground. On a bridge the bridge stays, and can't be sold while the camp is on it. Otherwise the command is refused with the reason. The camp packs up (`packSeconds`, 3 s), walks the shortest such way at `campSpeed` (1.2 tiles a second), then sets up again (`unpackSeconds`, 2 s). Moving it again on the way changes its course, with no new pack-up. If something is built in its way, it finds another way, or stops and sets up where it is. Each treasure chest it walks over is claimed.
- Reaching home (on, or next to, any of its tiles) wins.

**Building**
- Only while the camp is set up ("Set up camp first"), and only within `buildRadius` (5) tiles of it, in any direction ("Too far from your camp"). Selling (and clearing trees) is also only within `buildRadius`, camped or not. Everything else is as in Endless: prices, gold, build times (quickest next to the camp).

**Swarms**
- About one per `tilesPerSwarm` (900) tiles of map. Each is 4-8 enemies round a middle at least `swarmSpacing` (10) from other swarms, `clearOfStart` (20) from the camp's start and `clearOfHome` (6) from home. Each member's post is the tile it starts on.
- A swarm is as tough as the wave its distance across the map is worth: wave 1 at the left edge, `hardestWave` (12) at the right. That sets the kinds it can have (picked by the waves' mix weights) and their HP and bounty.
- Asleep, a member stands at its post, or walks back to it.
- A member that sees the camp (within `enemySight`, 6 tiles) or is hurt wakes its whole swarm. Awake, members behave as wave enemies: they walk their profile's field to the camp, break through what's in the way, and bombers, diggers and shamans do their thing.
- An awake member goes back to sleep `giveUpSeconds` (6 s) after it last saw the camp (or was hurt), and walks back to its post.

**Wanderers**
- `wanderers` (6) wave-1 goblins always roam the map, as raiders' roamers do. One more appears every `wandererSpawnSeconds` (5 s) while there are fewer, somewhere out of sight and more than the camp's outer sight away. They wake (alone) and give up like swarm members, then roam again.

## Still to do
- Online (co-op: one shared camp, or a camp each), and its lobby.
- A pad binding for Move camp (keyboard `C`, or the build menu's Civic tab, for now).
- The camp and home in the 3D view look like generic blocks.
- Hand-made Journey home maps in the map editor.
- Balance: swarm sizes, the camp's HP and sight, and how hard the right edge is are first guesses.
