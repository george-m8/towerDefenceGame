# Glyphs

Every character drawn on the map, and why it was picked. Glyphs live in `src/sim/config.ts` (enemies, units), `src/render/palette.ts` (structures, terrain, projectiles) and `src/render/canvas.ts` (a few markers). **Keep this page up to date when you add or change one.**

"Planned" marks the glyphs `field-units` brings in (its Task 2; see [`SPEC-field-units.md`](SPEC-field-units.md)).

## The rules

- **Enemies are letters, in their kind's colour.** Lowercase is the kind's first letter. Uppercase is the bigger or leading version of the same family (`b` barbarian, `B` their chief). When a letter is taken, the next most telling one is used. Variants of a kind (runt, brute) keep the letter and colour, and change only the glyph size.
- **Your units are drawn in your player colour.** Guards and field units use symbols, never letters, so they can't be mistaken for an enemy. Workers and the dev militia use lowercase letters that no enemy uses.
- **Structures are a tile with a background colour and a glyph.** The glyph says what the building does. A symbol is used where a clear one exists; a two-letter code is the last resort. Symbols must draw as plain text (no colour emoji), so emoji-capable characters such as ⚔ ⚒ ⛏ ⚖ ⛺ are avoided.
- **Terrain is a background colour**, with a glyph where the colour alone isn't enough.
- **Arrows point where things face.** Archer towers and wall spikes draw an arrow in their facing. Nothing else shows a facing; spawners show their door instead.

## Enemies

| Glyph | Enemy | Why |
|---|---|---|
| `g` | Goblin | **G**oblin |
| `z` | Zerg | **Z**erg |
| `w` | Wolf rider | **W**olf (`r` would suggest the ram) |
| `b` | Barbarian | **B**arbarian |
| `B` | Barbarian chief | Uppercase: the barbarians' leader |
| `d` | Dwarf | **D**warf |
| `D` | Dwarf thane | Uppercase: the dwarves' leader |
| `G` | Golem | **G**olem: uppercase because it's huge (and `g` is the goblin) |
| `m` | Marine | **M**arine |
| `M` | Marine captain | Uppercase: the tougher marine |
| `s` | Shaman | **S**haman |
| `x` | Dwarf bomber | **X**-plosion |
| `X` | Dwarf demolisher | Uppercase: the bigger bomber |
| `t` | Digger | **T**unneller (fallback `↳`, U+21B3, a path going down and along, if `t` ever clashes). It was `n` until `field-units` |
| `R` | Battering ram | **R**am: uppercase because it's huge |

Colours are per kind (`ENEMY_COLOURS` in `palette.ts`); a family shares a colour (barbarians orange, dwarves yellow, marines blue).

## Your units

| Glyph | Unit | Why |
|---|---|---|
| `i` | Militia (dev only) | A small, plain figure: a test unit |
| `j` | Lumberjack | Lumber**j**ack (`l` reads like `i`) |
| `p` | Miner | **P**ick (`m` is the marine) |
| `f` | Forager | **F**orager |
| `/` | Swordsman | A blade |
| `)` | Archer | A bow |
| `]` | Paladin | A shield |
| `!` | Scout *(planned)* | Alert, on the lookout |
| `&` | Soldier *(planned)* | A figure with a weapon |
| `}` | Ranger *(planned)* | A bigger bow than the archer's `)` |

## Structures

| Building | Glyph | Why |
|---|---|---|
| Keep (HP in the middle tile) | `⛫` castle (U+26EB) | A castle (was `K`) |
| Wall | `#` | Stacked stone |
| Ruin | `#` | A wall, crumbling (darker stone) |
| Gate | `∩` | An arch you can walk through |
| Archer tower | arrow in its facing | Fires one way, through a slit |
| Cannon | `C` | **C**annon (fires all round: no facing shown) |
| Catapult | `P` | **'P**ult (fires all round) |
| Watchtower | `T` | A **t**ower |
| Floor spikes | `^` | Spikes coming up |
| Wall spikes | arrow in its facing | Fires at the tile it faces |
| Bridge | `=` | Planks across |
| House | `⌂` house (U+2302) | A house shape (was `h`) |
| Shop | `¤` currency sign (U+00A4) | Money (was `S`) |
| Farmhouse | `Fa` | **Fa**rm; `⌂` is the house (was `H`) |
| Farmland | `𐤄` Phoenician he (U+10904) | A crop in a field (was `"`) |
| Timber yard | `Ti` | **Ti**mber; the watchtower has `T` (was `L`) |
| Mine | `Mi` | **Mi**ne; ⚒ and ⛏ can turn into emoji (was `M`) |
| Forager hut | `Fo` | **Fo**rager (was `F`) |
| Guardhouse | `⛨` cross on a shield (U+26E8) | A shield (was `G`) |
| Archery post | `➶` arrow (U+27B6) | An arrow (was `A`) |
| Paladin hall | `✠` Maltese cross (U+2720) | A holy order's cross (was `K`) |
| Scout camp *(planned)* | `⚑` flag (U+2691) | A flag planted at a camp |
| Barracks *(planned)* | `Ba` | **Ba**rracks (⚔ would be emoji) |
| Archery range *(planned)* | `◎` bullseye (U+25CE) | A target |

The two-letter codes are where no clear, non-emoji symbol has been found yet; they're drawn a little smaller. Better symbols are welcome. A test (`tests/render/glyphs.test.ts`) keeps every building glyph to one symbol or two letters, and rejects emoji-capable characters.

## Terrain

| Glyph | Terrain | Why |
|---|---|---|
| (checker) | Ground | Plain dirt, no glyph |
| (sandy) | Ford | Shallow water: colour only |
| `~` | River | A ripple |
| `≈` | Sea | Rougher water |
| `o` grey | Rock | A boulder |
| `o` gold | Gold-veined rock | The same boulder, gold |
| `♣` | Tree | A leafy crown |
| `b` red on green | Berry bush | **B**erries; red like the fruit, on a green bush (the tile colour tells it from the barbarian) |

## Markers and effects

| Glyph | What | Why |
|---|---|---|
| `$` gold | Treasure chest | Money lying on the map |
| `$` white | The sell tool's preview | Money back |
| `+` green | A shaman's heal | Health going up |
| `→` | Arrow in flight | An arrow (turns along its arc) |
| `•` | Cannonball in flight | A ball |
| `*` | Catapult stone in flight | A tumbling rock |
| `S` faint | A spawner's door | **S**pawn: where its units come out |
| white border | Where a spawner being placed sends its units (fainter: a guard building's spots) | Shows where not to build |
