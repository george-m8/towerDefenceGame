# Spec: skip-to-night

Status: APPROVED (2026-10-27)
Module: `skip-to-night`, on the capability map's Day and night section. Builds on `game-clock` and `night-spawns`.

## Objective

In a game with enemies at night, you can skip the rest of the day: when you've built what you want, start the night early. With other players, everyone has to agree, like pausing.

1. As a player by day, a **Skip to night** button jumps the clock to the early evening (17:00), so the night's first wave comes after the usual countdown.
2. In co-op, the button is a vote. The skip happens once every connected player has voted for it; the button shows how many have.

## Rules

- The button shows in the HUD beside **Pause** and **Fast forward** (the other votes), only with enemies at night and only by day (outside spawning time). By night it's hidden.
- **Solo:** pressing it skips straight away.
- **Co-op:** pressing it toggles your vote (press again to take it back), as Pause does. It happens as soon as every connected player has voted, the same unanimous rule as Pause and Fast forward. The button reads e.g. "Skip to night (1/2)", and the Players panel shows who has voted.
- **Skipping** (an "I'm ready for enemies!" button): the clock jumps to `NIGHT_SPAWNS.from` (17:00) on the same day. The sun and light jump with it. The wave countdown starts from full, as it does every evening. No gold is paid for the time skipped (unlike sending a wave early: skipping the day gives up building time, not fighting time).
- Votes are cleared when the skip happens, when spawning time starts on its own, and (as now) when a player drops out.
- The skip is a command, so it works the same solo and online, and replays the same.

## Out of scope

- Skipping the night, or to any other time.
- A key for it.
- Gold or any other reward for skipping.

## Data and code

- `src/sim/types.ts`: `votes.skipToNight` on each player; a `voteSkipToNight` command.
- `src/sim/players.ts`: `updateVotes` does the skip when it's unanimous (and it's day, with enemies at night), then clears the votes; votes also clear when spawning time starts.
- `src/sim/game.ts`: the command toggles the sender's vote; refused with enemies all the time ("No night to skip to") or by night ("It's already night").
- `src/sim/clock.ts`: `skipToNight(state)`.
- `src/ui/panel.ts` (the HUD's Pause and Fast forward buttons) and `src/ui/votes.ts`: the button and its count; `src/ui/players.ts`: a vote mark.
- The protocol's command parser accepts the new command; README (HUD and multiplayer).

## Testing

- Unit tests (`tests/sim/skipToNight.test.ts`): solo, the vote skips at once to 17:00, then the first wave comes after the countdown; with two players, one vote doesn't skip and two do; taking a vote back; votes clear after the skip, at dusk, and on a drop-out; refused by night and with enemies all the time; no gold paid.
- Protocol: the command parses; a room applies it as a vote.
- Browser, by hand: the button by day only; a co-op vote in two tabs.

## Success criteria

- [ ] By day in a night game, Skip to night jumps to 17:00 (solo at once; co-op once everyone votes).
- [ ] The button shows only by day in night games, with the vote count in co-op.
- [ ] Votes clear after the skip, at dusk and on drop-out; the command is refused by night and with enemies all the time.
- [ ] Unit and protocol tests, the typecheck and the build pass.

## Open questions

None.
