# Keep Defence

A browser-based, grid-based tower defence game. Build walls, towers, traps and houses around your keep and survive endless, growing waves. Text glyphs and coloured squares only, styled after Dwarf Fortress and classic Mac System 6/7.

See [`SPEC.md`](SPEC.md) for the full design and [`tasks/plan.md`](tasks/plan.md) for the build plan.

## Requirements

- Node.js 22 or 24 LTS (other versions may work but aren't supported by Vitest)
- npm

## Getting started

```sh
npm install
npm run dev
```

Then open http://localhost:5173, click (or press any key) past the title screen, enter a name and press **Play solo**. To play with friends, see [Playing together](#playing-together).

## How to play

Enemies spawn from the red strip on the left edge and walk to your keep (`⛫`, 300 HP). An enemy that reaches the keep stays there and keeps hitting it until it's killed; at 0 HP the keep falls and the game ends. Waves never stop, and each one is bigger and tougher than the last.

- Kill enemies with towers and traps to earn gold.
- Build houses for steady income.
- Most enemies take an open route if one exists, however long, and only break through your walls when the keep is completely sealed off. **Breachers** (dwarves, thanes, golems and rams) work out when smashing a wall is quicker than walking round, and go through the weakest point. **Marines** swim rivers and the sea when that's the quicker way in.
- Enemies mostly stick to their route, but at each tile there is a small chance (10% by default, `ENEMY.wanderChance` in `src/sim/config.ts`) that one drifts sideways onto an open tile instead. They never step backwards, double back onto the tile they just left, wander into structures, or step onto rock, trees or water (unless they can swim).

### Enemies

Waves 1 and 2 are all goblins. Later waves mix in other kinds from the wave shown: each wave has a threat budget (5 + 3 x wave, where a goblin costs 1) spent on whichever kinds have arrived. HP grows 15% per wave and bounties by 1 every 5 waves, for every kind. Each enemy hits structures in its way, and the keep, with its own damage and speed of attack.

| Glyph | Enemy | HP | Speed (tiles/s) | Hit | Bounty | From wave |
|---|---|---|---|---|---|---|
| `g` | Goblin | 20 | 1.5 | 5 every 1s | 2 | 1 |
| `z` | Zerg | 6 | 1.8 | 2 every 0.6s | 1 | 3 |
| `w` | Wolf rider | 14 | 3.0 | 4 every 0.8s | 3 | 4 |
| `b` | Barbarian | 30 | 1.8 | 4 every 0.6s | 3 | 5 |
| `d` | Dwarf | 45 | 1.0 | 8 every 1.2s | 4 | 6 |
| `B` | Barbarian chief | 90 | 1.2 | 8 every 0.5s | 10 | 7 |
| `D` | Dwarf thane | 120 | 0.9 | 14 every 1.2s | 12 | 9 |
| `m` | Marine | 25 | 1.4 | 5 every 1s | 3 | 7 |
| `x` | Dwarf bomber | 18 | 1.0 | 3 every 1s; blast 60 | 4 | 8 |
| `s` | Shaman | 30 | 1.2 | 3 every 1s | 6 | 8 |
| `t` | Digger | 20 | 1.2 | 6 every 1s | 4 | 9 |
| `G` | Golem | 250 | 0.6 | 40 every 3s | 20 | 10 |
| `M` | Marine captain | 60 | 1.2 | 10 every 1s | 8 | 11 |
| `X` | Dwarf demolisher | 40 | 0.9 | 5 every 1s; blast 120 | 9 | 11 |
| `R` | Battering ram | 400 | 0.5 | 60 every 2.5s | 30 | 12 |

What some of them do on top of walking:

- **Bands:** a barbarian chief arrives with 2-4 barbarians, a dwarf thane with 2-3 dwarves. They follow their leader's route (through the wall it breaks, if it's a breacher), never get more than a tile ahead, hurry to catch up, and attack whatever it attacks. When the leader dies they carry on alone.
- **Bombers** (`x`, `X`) spot a wall, tower, house or wall spikes you built within 3 tiles, sprint at it and explode, damaging everything in the 3x3 around them (the keep too, if it's in the blast, but never other enemies). They drop no bounty. Kill them before they arrive and nothing happens.
- **Shamans** (`s`) heal every other enemy within 2.5 tiles by 6 HP every 2 seconds (a green `+`).
- **Diggers** (`t`) walk to a wall or wall spikes you built within 4 tiles and dig under it until it falls, taking any tower on it down too. Towers and traps can still hit them while they dig.
- **Battering rams** (`R`) are slow breachers with huge hits.

Hover an enemy to see what it's doing, e.g. `Dwarf bomber, HP 18 / 18, sprinting` or `Barbarian raider, HP 30 / 30, with its chief`.

Most kinds come in **variants**, shown by glyph size: a small `g` is a goblin runt (weaker, faster), a large one a brute (tougher, hits harder). Hover an enemy to see which it is, e.g. `Goblin brute, HP 18 / 28`. All the numbers live in `ENEMY_KINDS` in `src/sim/config.ts`.

### Your units

You have people of your own on the map: workers, guards and field units, each spawned free by the building that makes them (one a minute, up to a set number alive). A unit belongs to a player, finds its own way around walls, fights enemies within reach and sees around itself (lifting fog as it goes). Enemies stop to fight a unit that's in their way or right next to them; battering rams ignore units. In PvP your towers shoot a rival's units before their buildings. A unit that dies bursts into pixels in its owner's colour, and nobody is paid for it.

Gatherer buildings make workers (see [Resources](#resources)). On the dev server you can also press `U` to put a militia (`i`) on the tile under the mouse; hover it to see `Militia (your name's), HP 30 / 30`.

### Resources

Trees, rocks and berry bushes hold resources, and workers turn them into gold. Build a gatherer (Civic tab) and it sends out a worker straight away, then another every minute, up to 5:

- **Timber yard** (60g, drawn `Ti`): lumberjacks `j` chop trees.
- **Mine** (100g, drawn `Mi`): miners `p` mine rock. Gold-veined rock (`o` in gold) pays three times as much.
- **Forager hut** (40g, drawn `Fo`): foragers `f` pick berry bushes (green, red `b`). Berries are food in the story; for now they pay gold too.

Each worker walks to the nearest resource it gathers (even into fog, lighting it up) and works it. Every resource tile is worth some gold and takes a set time to clear: every 3 seconds a worker pays you the share of its worth that work earned, and two workers on one tile clear it twice as fast. A tile that's used up disappears: a tree or rock becomes open ground, which can open a new route for enemies. Hover a resource to see what's left (`Tree - 18 of 30g of timber left`) or a worker to see what it's doing (`chopping`, `walking`, `idle: nothing to gather`).

Workers never fight. Enemies kill them like any unit, and in PvP your rival's towers shoot them, but their building sends a replacement as soon as it can. Sell or lose the building and its workers carry on, but nobody replaces them.

### Monster journal

The first time a kind of enemy comes into sight (not while it's hidden in fog), it gets an entry in the monster journal and a notice pops up over the map. Press `J`, or the **Monster journal** button, to read it: each kind you've found shows its glyph, what it does, its stats, the wave it first turns up in and the wave you first saw it, and its variants. Kinds you haven't met yet show as `?` with the wave they can first appear in. The journal is remembered on this device across games; **Forget** clears it.

### Structures

Open the build picker with the Build box or `1` / `2` / `3` for the **Defence**, **Civic** and **Offence** tabs, then click a tool.

| Tab | Structure | Glyph | Cost | What it does |
|---|---|---|---|---|
| Defence | Wall | `#` | 5 | Blocks movement. 50 HP. Towers can be built on top. |
| Defence | Archer | fletched arrow, pointing where it faces | 25 | Range 5, 6 damage every 1s, single target. Fixed 90° arc. |
| Defence | Cannon | `C` | 50 | Range 4, 15 damage every 2.5s, hits a 3x3 area. Turns 90°/s. |
| Defence | Catapult | `P` | 80 | Range 3-9, 30 damage every 5s, hits a 5x5 area. Can't hit enemies closer than 3 tiles. Turns 30°/s. |
| Defence | Floor spikes | `^` | 15 | Walkable. Every 1.5s spikes come up and deal 15 damage to every enemy on the tile. |
| Defence | Wall spikes | arrow `↑→↓←` | 20 | A wall section that fires every 2s, dealing 20 damage to the one tile it faces. Press `R` to rotate before placing. |
| Defence | Bridge | `=` | 10 | Only on river tiles. Makes the river walkable there (for enemies too). |
| Defence | Watchtower | `T` | 20 | Doesn't attack. Sees all round, as far as a cannon (see [Fog of war](#fog-of-war)). Stands on open ground or a wall, like a tower. |
| Defence | Gate | `∩` | 15 | Part of a wall that enemies walk straight through. Still closes a ring of walls, so the area inside counts as enclosed (and keeps its discount). |
| Defence | Guardhouse | `⛨` | 60 | Sends out up to 3 swordsmen, one every 30s, to guard the tiles in front of it. Placed facing a way (`R`). See [Guards](#guards). |
| Defence | Archery post | `➶` | 70 | Sends out up to 3 archers who shoot from the tiles in front of it. Placed facing a way. |
| Defence | Paladin hall | `✠` | 90 | Sends out up to 3 paladins who hold the tiles in front of it. Placed facing a way. |
| Offence | Scout camp | `⚑` | 40 | Sends out up to 2 scouts, one every 45s, to explore the fog. See [Field units](#field-units). |
| Offence | Barracks | `Ba` | 80 | Sends out up to 4 soldiers, one every 30s, who hunt enemies and (in PvP) attack the rival keep. |
| Offence | Archery range | `◎` | 90 | Sends out up to 4 rangers, one every 30s, who do the same from range. |
| Civic | House | `⌂` | 40 | +2 gold every 5s. Blocks movement. |
| Civic | Shop | `¤` | 70 | +4 gold every 5s. Blocks movement. |
| Civic | Farmhouse | `Fa` | 50 | +1 gold every 10s for each field joined to it (up to 8). Blocks movement. See [Farms](#farms-and-town). |
| Civic | Farmland | `𐤄` | 3 | A field: walkable, 10 HP. Counts for a farmhouse it's joined to. Heavy enemies trample it. |
| Civic | Timber yard | `Ti` | 60 | Sends out up to 5 lumberjacks, one a minute, to chop trees for gold. Blocks movement. |
| Civic | Mine | `Mi` | 100 | Sends out up to 5 miners to mine rock (gold-veined rock pays 3x). Blocks movement. |
| Civic | Forager hut | `Fo` | 40 | Sends out up to 5 foragers to pick berry bushes. Blocks movement. |
| Every tab (`X`) | Sell | `$` | - | Refunds 50% of cost, less if damaged. Sells the top layer first (a tower before the wall under it). Also clears trees. |

### Doors

Every building that sends out units (gatherers, guard and offensive buildings) has a **door**: the side its units come out of. Press `R` while placing to turn it. While you place one, its door gets a white border (and a guard building's spots a fainter one); once built, a faint `S` marks the door, so you can avoid building in front of it. If the door is blocked, units come out of the next open side clockwise, and the `S` moves there.

### Guards

Guard buildings (Defence tab) each make one kind of guard, free, up to 3 at a time (a new one every 30 seconds while short). Build one facing where you want it guarded (`R` rotates): its guards stand on the open tiles in front of it, two rows of three, the middle first, sharing a tile if there's little room. Build over a spot and its guard moves to the next.

| Guard | Glyph | HP | Armour | Hit | Range | What it does |
|---|---|---|---|---|---|---|
| Swordsman | `/` | 60 | 1 | 8 every 1s | 1 | Runs at enemies that come within 3 tiles of its spot, then walks back |
| Archer | `)` | 35 | 0 | 6 every 1.2s | 4 | Stays on its spot and shoots arrows |
| Paladin | `]` | 120 | 4 | 5 every 1.2s | 1 | Holds its tile: enemies stop to fight it and its armour takes the edge off every hit |

Armour is taken off each hit a guard takes (at least 1 always gets through). Enemies stop to fight a guard in their way or beside them, so paladins in a gap with archers behind hold it well; battering rams walk straight through guards, and bomber blasts hurt them. Sell or lose a guard building and its guards stay on their spots, but nobody replaces them. Hover a guard to see `guarding`, `fighting`, `chasing` or `returning`. In PvP, guards also fight a rival's units, and rival towers shoot them.

### Field units

Offensive buildings (Offence tab) send units out across the map. They only ever walk on land your side has explored.

| Unit | Glyph | HP | Armour | Hit | Range | What it does |
|---|---|---|---|---|---|---|
| Scout | `!` | 20 | 0 | - | - | Runs to the edge of the fog and pushes it back, again and again. Never fights. Waits at its door once there's nothing left to explore |
| Soldier | `&` | 70 | 2 | 10 every 1s | 1 | Hunts any enemy your side can see; with none, patrols the edge of the fog |
| Ranger | `}` | 40 | 0 | 7 every 1.2s | 5 | The same, shooting arrows from range |

In **PvP**, once your side has seen the rival's keep, soldiers and rangers march on it. They go round walls when that's quick, and otherwise break through the weakest wall in the way (the wall before any tower on it, earning the same bounty a tower would), then attack the keep. Hover one to see `fighting`, `besieging`, `hunting` or `patrolling` (scouts: `scouting`, or `waiting` at home).

### Farms and town

When the trees and rocks nearby are gone, farms and a town keep the gold coming.

- **Farms:** build a farmhouse, then paint farmland out from it. A field counts if it touches the farmhouse (not diagonally) or joins it through other fields, up to 8 per farmhouse; a field joined to two farmhouses counts for the nearer. Loose fields earn nothing. Hover a farmhouse to see `Farmhouse - 6 of 8 fields, +6g every 10s`, or a field to see which farmhouse it counts for.
- **Trampling:** every enemy has a weight. Each step onto a field takes that much off its 10 HP: goblins and zergs are light (0) and do no harm, most others weigh 1, leaders (chiefs, thanes, captains, demolishers) 2, golems 4 and battering rams 6. A trampled field that breaks a chain cuts off the fields beyond it. Your own units don't trample.
- **Town:** houses (+2g every 5s) and shops (+4g every 5s) earn a flat income wherever they are.

### The map

Every game starts on a new, randomly generated map (the seed is shown in the panel and on the game-over screen). Hand-made maps come from the [map editor](#map-editor).

Maps come in six sizes, picked in the mode's settings (choose a mode, set it up, then **Start**): XXS (42 x 28), XS (66 x 44), S (108 x 72), M (153 x 102, the default), L (216 x 144) and XL (270 x 180). On XXS the keep stands at the far right, its walls along the edge, so the enemies from the left have the whole map to cross.

| Terrain | Look | Walk | Build | Notes |
|---|---|---|---|---|
| Ground | dark checker | yes | yes | |
| Ford | sandy | yes | yes | A shallow crossing of the river |
| River | `~` light blue | no | bridges only | Build a bridge (`8`) to cross it anywhere else |
| Sea | `≈` dark blue | no | no | Coastline along one edge |
| Rock | `o` grey | no | no | Miners mine it (worth 30-60g, 135s of work); open ground once used up |
| Gold-veined rock | `o` gold | no | no | About 1 rock in 8. Miners mine it (worth 90-180g, 135s) |
| Tree | `🌲` green | no | no | Lumberjacks chop it (worth 20-40g, 90s). Or clear it with `X` for 1 gold |
| Berry bush | `🫐` dusky red on green | yes | no | Foragers pick it (worth 15-30g, 60s) |

- **Ruins** (`#` in dark stone) are old, damaged walls. They block enemies, can hold a tower, and sell for a little salvage. You can't build new ones.
- **Treasure chests** (`$` in gold) are piles of gold lying on the map (20-60, more the further from the keep). Build anything on one to claim it.
- There is always a walkable route from the spawn to the keep, and nothing walkable is ever cut off.

### Fog of war

You start out seeing only the land around your keep. Everything you build lets you see further.

- **In sight** (drawn normally): close to your keep and buildings. You see everything here, enemies included.
- **Seen** (under a thin white mist): further out, or anywhere you've seen before. You see the land and what's built on it, but not enemies or shots. Seen land stays seen, even after you sell what revealed it.
- **Unexplored** (white fog, see-through for a couple of tiles at its edge): never seen. You can't build, sell or clear trees here.
- You can build on land that's in sight or seen. The enemy spawn strip starts seen, so you know where enemies come from but not when they're on their way.
- Enemies don't care about the fog: they move and fight the same either way.
- In co-op, sight is shared, and anyone can build wherever anyone has seen.

How far each building sees (in sight / seen, in tiles):

| Building | In sight | Seen | |
|---|---|---|---|
| Keep | 12 | 18 | |
| Catapult | 10 | 14 | |
| Archer | 6 | 10 | only along its 90° arc, plus the tiles right around it |
| Cannon, watchtower | 5 | 9 | |
| House | 3 | 6 | |
| Spikes, bridge | 2 | 4 | |
| Wall | 1 | 1.5 | enough to see what's attacking it |

Walls barely see past themselves, so build watchtowers to explore. Hover a structure to see its sight, and hover a watchtower (or place one) to see the area it covers. Every tower sees at least as far as it shoots. Fog of war is on by default; turn it off in the game's settings (after picking a mode) to play with the whole map visible, and in a room the host's choice applies to everyone. For testing, adding `fog=off` to the address (e.g. `?solo&fog=off`) turns it off whatever the settings say.

### Enclosures

Close off an area and building there gets cheaper. An area is enclosed when enemies can't walk to it from their spawn. Walls, gates (which enemies still walk through), towers, houses, ruins, rock, water, trees and the map edge can all form the barrier, but at least one piece of it must be something you built (ruins alone don't count).

The keep starts walled in: a ring of walls one tile out from it, with a gate in the side facing the enemy (towards the spawn, or the middle of the map in PvP). The courtyard inside is the keep's enclosure from the start. The starting walls were free, so selling them pays nothing; in PvP each player owns the walls round their own keep.

- **Inside the keep's walls: 50% off.** This covers an enclosure that touches the keep, including walls hugging the keep and pockets walled off against its side.
- **Any other enclosure: 25% off.**
- The discount covers everything inside and the walls around it, so towers mounted on those walls are cheaper too. The wall that closes the ring pays full price.
- Enclosed areas and their walls are shaded: gold for the keep, blue for others, on the map and the minimap. Hover shows the discount, and with a build tool selected the info box shows the price on that tile.
- Selling refunds half of what you paid. If enemies can reach the area again (a wall sold or destroyed), the discount stops.
- In co-op, anyone building in an enclosure gets its discount.

### Towers on walls

Archers, cannons and catapults can stand on **open ground** or on **top of a wall**:

- **On a wall** (drawn on the wall colour with a strip along the top): the wall blocks enemies and takes all the hits. If the wall is destroyed, the tower falls with it, with no refund.
- **On the ground:** the tower blocks enemies like a building. Enemies only attack it when it is in the way of the keep.

Towers can't go on spikes, houses, the keep or the spawn zone. Hover a tower to see whether it is on a wall or the ground.

### Facing and arcs

Every tower faces north, east, south or west. Press `R` before placing to rotate it (the white notch on the tile shows which way). Facing is permanent: sell and rebuild to change it.

- **Archers** are fixed behind an arrow slit and only fire inside a 90° arc centred on their facing.
- **Cannons and catapults** can fire in any direction, but have to turn onto a target first (cannons at 90°/s, catapults at 30°/s), so enemies slipping past behind them may get through before they line up. Hover one to see its current aim.
- While placing or hovering a tower, the tinted tiles are exactly the ones it can fire at.

Towers always shoot the enemy closest to the keep. Traps fire on a fixed timer from the moment they're built, whether or not an enemy is there.

### Controls

| Input | Action |
|---|---|
| `1` / `2` / `3`, or the Build box | Open the build picker on the Defence, Civic or Offence tab; click a tool to select it |
| `X` | Select sell |
| Left click | Place (or sell) |
| Left drag | Paint walls, spikes, bridges, gates, farmland, or sell/clear along the dragged tiles |
| Right click or `Esc` | Clear the selected tool |
| `R` | Rotate the facing of the tower or wall spikes you're placing |
| `Space` or Pause button | Pause / resume (you can still build while paused) |
| `F` or `>>` button | Toggle fast forward (2x game speed) |
| Send wave button | Start the next wave now, for +1 gold per second skipped |
| `` ` `` or Debug button | Open the Debug menu: test options, Show paths (arrows show where enemies will walk; red means "will attack this"), and Sun slider (two sliders over the map: **Across** moves the sun from the left horizon to the right, **Arc** sets how high its path rises, 90° being straight overhead; shadows follow. Off puts the sun back) |
| `J` | Open or close the monster journal (`Esc` also closes it) |
| Hover a tile | Show its details in the Info box, and a tower's range |
| `W` `A` `S` `D` or arrow keys | Move the view around the map |
| Mouse wheel, or `+` / `-` | Zoom in and out (the wheel zooms around the cursor) |
| Minimap (top of the panel) | Click or drag to move the view there; the white box is what you're looking at |
| `-` / `+` / `Fit` buttons | Zoom out, zoom in, or show the whole map |

Dev server only: `E` spawns one enemy of each kind in turn (goblin, zerg, wolf rider, ...), `M` spawns 200 goblins (stress test), and `U` puts a militia on the hovered tile. These only work offline.

## Map editor

Open http://localhost:5173/?editor (or `?editor=example` to open `maps/example.map`) to design a map by hand. A map is drawn exactly as in the game, and saved as a `.map` file in [`maps/`](maps/) that you commit like code. Later, a **level** will combine a `.map` file with a `.wave` file and a `.loadout` file (the next two editors); a `.map` file holds only the map, no settings.

- **New** starts on open ground or on a generated map (pick the seed), at any size, for Endless (one keep, enemy spawns) or PvP (two keeps). The seed also fixes how much each tree, rock and bush holds.
- **Open** lists the maps in `maps/`, or opens a `.map` file from your computer. **Save** writes `maps/<name>.map` (with `npm run dev` only); **Download** saves a copy anywhere. Leaving with unsaved changes asks first (the title shows a dot).
- **Play** (`P`) plays the map as a single-player game with today's waves and starting gold; **Back to editor** returns to it, undo history and all. Play is off while the map has errors (no spawn, no way from the spawn to the keep, a keep on rock...), listed in the status line; warnings (a spawn close to the keep, a chest you can't reach) don't stop it.
- **Keep walls** rebuilds the ring of walls and the gate round each keep, as a new game has.
- **Debug** (`` ` ``, under the title) has **Show paths** and the **Sun slider**, as in the game.
- **Playing a map:** solo, Endless's settings (after picking Endless on the mode screen) have a **Map** dropdown listing the Endless maps in `maps/` (those with no errors), or open `?solo&map=<name>`. Online rooms still play generated maps for now.

| Input | Action |
|---|---|
| `1` / `2` / `3` | The build picker, as in game: pick a structure to place (free, built at once, belonging to the nearest keep) |
| `4` | The Map tab: terrain, keep, spawn zone, ruin, chest |
| `R` | Turn the facing of what you're placing |
| `X` | Eraser: a tower, then what it stands on, then a ruin or chest, then a spawn tile, then terrain back to ground |
| Left click / drag | Use the tool; terrain, walls and the eraser paint along a drag; drag a keep to move it |
| `Shift` + drag | Fill a rectangle with the picked terrain (a spawn zone is always a rectangle) |
| `[` / `]` | Brush size (1, 3, 5), or the ruin's HP or chest's gold |
| `Ctrl+Z` / `Ctrl+Y` (or `Ctrl+Shift+Z`) | Undo / redo (whole strokes, 100 steps) |
| Right click or `Esc` | Drop the tool |
| `W` `A` `S` `D`, arrows, wheel, `+` / `-`, minimap | Move and zoom, as in game |

Painting terrain under something that can't stand on it removes that thing, and the status line says so. A `.map` file is JSON: the terrain is one line per row (`.` ground, `,` ford, `~` river, `=` sea, `o` rock, `$` gold rock, `T` tree, `b` berries), then the keeps, spawn zones, ruins, chests and structures. Tell your editor to open `*.map` as JSON (it isn't a source map). The format is in [`SPEC-map-editor.md`](SPEC-map-editor.md).

## Items editor

Open http://localhost:5173/?items-editor (or `?items-editor=example` to open `items/example.items`), or press **Items** in the map editor's toolbar (**Maps** goes back), to choose what players may build and how many of each they can have **at a time**. There's a row per structure, grouped like the build picker (Defence, Civic, Offence):

- **Allowed:** untick it and the structure can't be built at all; it isn't offered in the build picker.
- **Max at once:** blank (the default) means no limit. With a number, a player can have that many standing (built or still going up); selling one frees a place. The build picker shows `2/5` beside a limited structure, and nothing beside an unlimited one.

**New**, **Open**, **Save** (into `items/`, with `npm run dev` only) and **Download** work as in the map editor. **Play** tries the limits out in a solo Endless game, on a generated map or a map from `maps/`; **Back to editor** returns. To play with an items file, pick it under **Build Setup** in solo Endless's settings, or use `?solo&items=<name>` (online rooms have no limits yet).

An `.items` file is JSON, and a structure that isn't listed has no limit:

```json
{
  "format": "keep-defence-items",
  "version": 1,
  "title": "Example",
  "limits": { "archer": 6, "cannon": 3, "paladinHall": 0 }
}
```

## Sound and music

Everything you hear is played by the game's own small chiptune synth (pulse waves with PWM, triangle, sawtooth, sine and noise, with volume and pitch envelopes) on the browser's Web Audio API. There's no audio library.

- **Sound effects** come from what happens in the game: hits, cannon and catapult blasts, enemies reaching the keep, treasure claimed, a wave starting, the keep falling, and your own builds, sales and refused actions. Busy waves are capped so they stay a rhythm, not a wall of noise. Online, everyone hears the game's events.
- **Music** follows where you are. The **intro** music starts when you dismiss the title screen and plays once, to the end, carrying on into the start screen. If it finishes while you're still in the menus (or an online waiting room), **menu** music takes over. Starting a game switches to **in-play** music, one song after another, and the keep falling plays the **game-over** song. Restarting goes back to in-play music.
- **Medieval instruments:** songs play on chiptune takes on medieval instruments, chosen from the instrument each part of the MIDI file asks for: pianos on harpsichord, guitars on lute, synth leads and flutes on recorder, reeds on shawm, brass on sackbut, strings on viol, organs and pads on a portative organ, and drums on a drum, tabor and tambourine.
- **Even volume:** each song is turned up or down when it starts so they all play at about the same loudness.
- **Built-in songs:** Concertino in D (John Baston) for the intro and a short original theme in the menu. There's no built-in in-play or game-over music yet; a [music pack](#music-packs) can add it.
- **Sound: on/off**, the **Music** and **Effects** sliders and (when you have music packs) the **Songs** choice sit at the bottom of the side panel, and they're remembered on this device.
- **Now playing** under the Sound button shows the song's title (hover for the whole name). **Skip** moves on to another song in the menu or in a game, ends the intro (menu music takes over), and stops the game-over song.
- Browsers only allow sound after a click or key press, so the game is silent until the first one (dismissing the title screen counts).
- **Tuning sounds:** every effect is defined in `src/audio/sounds.ts`. With the dev server running, open http://localhost:5173/?soundtest to play each one.

### Music packs

A music pack replaces the game's music with your own MIDI files, without touching any code. Each pack is a folder in `public/music/music-packs/`, with a folder per place:

```
public/music/music-packs/
  music-pack-1/
    intro/      plays once at the start, into the menus
    menu/       after the intro, while still in the menus
    in-play/    during a game
    game-over/  once, when the keep falls
```

- **A folder with `.mid` files replaces the built-in songs for that place.** An empty or missing folder keeps the built-in ones.
- **Several songs in a folder** are shuffled: menu and in-play move on to a random different song when one ends.
- **Choosing a pack:** the **Songs** dropdown in the Sound panel lists your packs and **Built-in**. It starts on the first pack (alphabetically).
- The dev server notices new or removed files and reloads the page. For a build, the packs present when you run `npm run build` are included.
- Pack songs use the default instrument mapping (see step 3 below).
- **Files from Online Sequencer** (onlinesequencer.net) play too, although that site writes channel numbers in a way other players misread. Notes it saves at zero volume (people draw pictures with them) stay silent.
- **Pack files stay out of git** (`.gitignore`), because songs in packs are usually someone else's copyright. Keep packs for your own use, and don't deploy a build that includes songs you aren't allowed to share.

### Adding a song

To add a song to the built-in music instead (it's committed, so it must be one you're allowed to share):

1. Put the MIDI file in `public/music/`, e.g. `public/music/castle-theme.mid` (format 0 or 1).
2. Add an entry to `SONGS` in `src/audio/songs.ts`. With several songs for a place, one is picked at random:

   ```ts
   {
     id: "castle-theme",
     title: "Castle Theme",
     plays: ["menu"], // intro, menu, in-play or game-over
     loop: true, // false: menu and in-play move on to another song when it ends
     source: "Where it came from (URL or author)",
     licence: "The licence you have it under, e.g. CC BY 4.0",
     file: "castle-theme.mid",
   },
   ```

3. **Instruments:** MIDI channel 10 plays drums (kicks and toms on the drum, snares on the tabor, hi-hats and cymbals on the tambourine). Other channels play the medieval instrument for their General MIDI program (`PROGRAMS` in the same file). A song with no program changes at all gives its channels recorder, lute, bass and harpsichord in the order they first appear. To choose for yourself, add `channels: { 0: "recorder", 1: "bass" }` (MIDI channels counted from 0). Instrument sounds are in `INSTRUMENTS`.
4. **Check the rights.** MIDI arrangements of existing songs usually have their own copyright, so only add songs you're allowed to use, and record where each came from.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Typecheck and build the production bundle into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the unit tests once |
| `npm run test:watch` | Run the unit tests in watch mode |
| `npm run coverage` | Run the tests with coverage (fails under 80% lines in `src/sim/`, `src/net/` and `server/`; HTML report in `coverage/`) |
| `npm run typecheck` | Typecheck the client and the server without building |
| `npm run server` | Start the multiplayer game server (restarts on change) |
| `npm run server:probe -- <host[:port]> [seconds]` | Check a game server is reachable: creates a room and prints updates |
| `npm run build:server` | Bundle the game server into `dist-server/` |
| `npm run start` | Run the bundled server, serving `dist/` and `/ws` on one port |
| `npm run format` | Format all files with Prettier |

## Playing together

Up to 4 players can defend the same keep, each with their own gold and structures.

**1. The host starts the server and the game** (on one computer):

```sh
npm run server            # the game server
npm run dev -- --host     # the game page, reachable from other computers
```

**2. The host creates a room:** open `http://localhost:5173`, enter a name and press **Create room**. The waiting room shows the room code (e.g. `RUVM`) and a **Copy invite link** button.

**3. Friends join** from their browser (they don't need to install anything): either open the invite link, which fills in the code, or open `http://<host's address>:5173`, enter the code and press **Join**.

`npm run server` prints the host's address (e.g. `192.168.1.20`). Friends must be on the same network. If they can't connect, the host's firewall is probably blocking it: on macOS, allow `node` to accept incoming connections (System Settings > Network > Firewall). A second tab on the host also works as a second player, for trying it alone.

**4. The host presses Start game** once everyone is in. Until then the game is frozen, so nobody gets a head start. If the host leaves the waiting room, the next player becomes host. Friends can still join after the start.

**Playing:**
- Gold is your own: you earn bounties for kills by your towers and traps, and income from your houses.
- You can only sell what you built (ruins are anyone's). Towers go on your own walls or on ruins.
- Each structure has a corner mark in its owner's colour; the panel lists players, and hover info says who built what.
- **Pause** and **fast-forward** are votes: they happen when every connected player has pressed them, and the buttons show the count (e.g. `Pause 1/2`). Press again to take your vote back.
- Builds show faintly until the server confirms them.
- If your connection drops, the game reconnects you; reloading the page rejoins as the same player.
- When the keep falls, anyone can press **Restart** for a new game in the same room.

To play on your own, press **Play solo** on the start screen (or open `?solo`). Links of the form `?create&name=Ann` and `?room=CODE&name=Bo` skip the start screen.

## Running the multiplayer server

**On your machine (development):**

```sh
npm run server            # game server on port 8787
npm run dev -- --host     # the game, reachable from other machines; forwards /ws to the server
```

The server prints the address other people on your network should use, for example `http://192.168.1.20:5173`.

**Check it's reachable** from another machine on the same network (with this repo checked out and `npm install` done):

```sh
npm run server:probe -- 192.168.1.20
```

It should print a welcome and a line per update. If it can't connect, check that the host's firewall allows incoming connections on port 8787.

**Friends outside your network** need a tunnel or a port forward to your machine until the game is hosted somewhere.

**Production (one process, one port):**

```sh
npm run build && npm run build:server
PORT=8080 npm run start   # serves the game and /ws on port 8080
```

| Environment variable | Default | Meaning |
|---|---|---|
| `HOST` | `0.0.0.0` | Interface to listen on (all, so other machines can connect) |
| `PORT` | `8787` | Port for the game server (and the page, in production) |

Rooms live in memory: restarting the server ends every game. See [`SPEC-game-server.md`](SPEC-game-server.md) for the protocol.

## Project structure

Every glyph on the map (enemies, units, buildings, terrain, markers) and why it was chosen is listed in [`GLYPHS.md`](GLYPHS.md).

```
index.html            Page shell: map canvas + side panel
src/main.ts           Bootstraps the game and runs the fixed-step loop (20 ticks/s)
src/sim/              Pure, deterministic game simulation (no DOM, seeded RNG)
  config.ts           All tunable numbers: structures, enemies, waves, economy
  game.ts             createGame, tick, applyCommand
  grid.ts             Placement rules and tile occupancy
  pathfinding.ts      Flow fields from the keep, one per movement profile (follower, breacher, marine)
  enemies.ts          Spawning, walking, bands and attacking
  behaviours.ts       Bombers, shamans and diggers
  movement.ts         Tile-to-tile stepping shared by enemies and units
  units.ts            Player units: spawning, spawner buildings, behaviours (hold, gather), fighting
  resources.ts        Resource amounts on the map, and harvesting them for gold
  farms.ts            Farmhouses, which fields count for them, farm income, trampling
  guards.ts           Guard spots in front of guard buildings
  fieldUnits.ts       Scouts, soldiers and rangers: the fog's edge, hunting, patrolling, sieges
  unitPaths.ts        (also) paths over explored land only, and through a rival's weakest wall
  unitPaths.ts        Path search for units (to the nearest of any number of goals)
  towers.ts           Tower targeting and damage
  traps.ts            Spike trap cycles
  waves.ts            Wave formulas and scheduling
  economy.ts          Bounties, house income, selling
  players.ts          Players, per-player gold, pause/fast-forward votes
  mapFile.ts          .map files: parse, write, validate
  itemsFile.ts        .items files: what can be built, and how many at once
src/net/              Message types and state snapshots, shared by browser and server
src/render/           Canvas drawing (reads state, never changes it)
src/ui/               Side panel, input, hover info, game-over dialog
src/audio/            Synth, sound effects, MIDI reader, music player, playlist and song list
public/music/         MIDI files for the songs listed in src/audio/songs.ts
public/music/music-packs/  Your music packs (git-ignored)
tools/                Vite plugins: the music packs, and the .map and .items files (and saving them)
src/editor/           The map editor (?editor): edits, undo, tools, toolbar, files
maps/                 Hand-made maps (.map files), made in the map editor
items/                Build limits (.items files), made in the items editor (?items-editor)
src/styles.css        System 6/7 style window chrome
server/               Multiplayer game server (Node): rooms, connections, static files, probe
tests/sim/            Unit tests for the simulation
tests/server/         Protocol, room and socket integration tests
```

The UI never changes game state directly. Input is turned into commands (`build`, `sell`, `togglePause`, `sendWave`) that `applyCommand(state, playerId, command)` validates, which keeps the simulation testable and is the seam for multiplayer.

The simulation already supports several players on one map (see [`SPEC-players.md`](SPEC-players.md)): each has their own gold and structures, can only sell their own, and pause and fast-forward only happen when every connected player votes for them. Online play itself comes with the `game-server`, `net-client` and `lobby` modules in [`CAPABILITIES.md`](CAPABILITIES.md). Offline, you are player 1 and the game plays exactly as before.

## Tuning

Every gameplay number lives in `src/sim/config.ts`. The current values are first-pass guesses and haven't been balanced yet. Tests read their numbers from config, so changing one never breaks a test that isn't about it.

The economy, to balance against each other:

| What | Where (`config.ts`) | Now |
|---|---|---|
| Starting gold | `STARTING_GOLD` | 250 |
| House cost and income | `STRUCTURES.house` | 40g; 2g every 5s (24g a minute) |
| Shop cost and income | `STRUCTURES.shop` | 70g; 4g every 5s (48g a minute) |
| Farm: farmhouse cost, gold per field, interval, most fields | `STRUCTURES.farmhouse` (`cost`, `farm`) | 50g; 1g per field every 10s; 8 fields (a full farm: 48g a minute) |
| Farmland cost and HP | `STRUCTURES.farmland` | 3g; 10 HP |
| How hard each enemy tramples | `ENEMY_KINDS.*.weight` | 0 (goblin, zerg) up to 6 (ram) |
| Guard buildings: cost, quota, spawn interval | `STRUCTURES.guardhouse`, `.archeryPost`, `.paladinHall` | 60 / 70 / 90g; 3 guards; one every 30s |
| Guard stats (HP, armour, damage, range, speed, how far swordsmen chase) | `UNIT_KINDS.swordsman`, `.archer`, `.paladin` (`chase`) | see [Guards](#guards) |
| Offensive buildings: cost, quota, spawn interval | `STRUCTURES.scoutCamp`, `.barracks`, `.archeryRange` | 40 / 80 / 90g; 2 / 4 / 4 units; every 45 / 30 / 30s |
| Field unit stats | `UNIT_KINDS.scout`, `.soldier`, `.ranger` | see [Field units](#field-units) |
| Gatherer cost, quota, spawn interval | `STRUCTURES.timberYard`, `.mine`, `.foragerHut` (`cost`, `spawner`) | 60 / 100 / 40g; 5 workers; one every 60s |
| Worker stats (HP, speed, how often gold comes in) | `UNIT_KINDS.lumberjack`, `.miner`, `.forager` (`attackInterval`) | paid every 3s |
| What each resource tile is worth, and how long one worker takes to clear it | `RESOURCES` (`worth`, `seconds`) | trees 20-40g / 90s, rock 30-60g / 135s, gold-veined 90-180g / 135s, berries 15-30g / 60s |
| How much is on the map | `MAP_GEN` (`forestsPer1000`, `rockClustersPer1000`, `goldVeinChance`, `berryPatchesPer1000`, ...) | gold veins 12% of rock |
| Clearing a tree with `X` | `TREE_CLEAR_GOLD` | 1g |

A worker earns about `average worth / seconds` gold a second while working (walking between tiles not counted): 0.33g/s on trees, berries and plain rock, 1g/s on gold veins. So a full gatherer (5 workers) earns about 100g a minute (a mine up to 300g on gold veins), against a house's 24g. To make a resource pay more for the time, raise its `worth` or lower its `seconds`.
