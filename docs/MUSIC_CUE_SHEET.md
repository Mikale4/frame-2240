# Music cue sheet

Seventeen tracks, generated in Suno, dropped into `assets/music/` as `<name>.mp3`.
Eight screen tracks, eight pilot themes, one stage theme.
Names here are load-bearing: `MusicBank` loads by name, and a file that is not
listed is not loaded.

> **Adding a track is two steps.** Drop the file in `assets/music/`, then flip
> its `present` flag in `MUSIC_CUES` (`src/audio/MusicBank.ts`). The flag is what
> stops the loader requesting a path that does not exist — Vite answers an
> unknown path with `index.html` and a 200, which hands the audio decoder HTML.
> `music.test.ts` checks the flags against the directory **in both directions**,
> so a file added without its flag, or a flag set without its file, fails the
> suite rather than going quietly silent.

If a track is missing the scene is **silent** — never a crash, and never a
request for a path that does not exist. (Vite answers an unknown path with
`index.html` and a 200, so asking for a missing `.mp3` hands the audio decoder
HTML. `BootScene` already guards art this way.)

---

## The sound

One direction across the whole soundtrack, so it reads as one score:

> **Anime action opening meets J-rock and drum & bass, with electro edges.**
> High BPM. Driving bass guitar, punchy high drums, tight percussion.
> Racing-game pop-rock energy — *Umamusume: Pretty Derby* as the touchstone.

Keep the **shared descriptors** in every prompt and vary only intensity, tempo
and mood. That consistency is what makes sixteen separately generated tracks
sound like one album rather than sixteen commissions. The per-pilot themes lean
hardest on this: they have to be recognisably different people *and* recognisably
the same game.

> **One documented exception: `archive`.** Every track above scores a fight or the
> approach to one. The Archive scores *reading*, and the house style actively
> works against that, so it drops the J-rock and the breakbeat entirely and keeps
> its kinship to the album through timbre instead. It is the only prompt here
> that should not repeat the descriptors in this section.

### Practical notes for generating

* **Instrumental ON for every track. No lyrics anywhere, including the title.**
  Every prompt ends in `instrumental`; leave Suno's Instrumental toggle on as
  well, since the toggle is more reliable than the word. Vocals would fight the
  pilot banter, the combat SFX and the saturation cutscene's spoken line — and a
  sung hook is the fastest thing in music to tire of on the twentieth match.
* **Length**: whatever Suno gives (2–4 min) is right. The player loops the whole
  file, so a long track means less repetition across a match. Do **not** trim to
  a short loop — that was the 2005 reference's constraint, not ours.
* **Loop point**: no seamless-loop requirement. `MusicPlayer` cross-fades a track
  into itself at the seam, so an imperfect ending is covered.
* **Export**: mp3. Filename must match the cue name exactly, lower case.

---

## Screen tracks

| Cue name | Where it plays | BPM |
| --- | --- | --- |
| `title` | `TitleScene` | 174 |
| `menu` | `MenuScene`, controls, audio | 172 |
| `select` | `MechSelectScene`, rival skill | 176 |
| `battle_danger` | Battle, either pilot under 25 % life — **overrides the pilot theme** | 182 |
| `results_win` | `ResultsScene` — VICTORY | 168 |
| `results_lose` | `ResultsScene` — DEFEAT and DRAW | 140 |
| `training` | `BattleScene` in training mode | 170 |
| `archive` | `ArchiveScene` — the lore reader | 72 |

`DRAW` shares `results_lose`: reflective suits a draw far better than a fanfare,
and a third results track for an uncommon outcome is not worth a generation.

The **saturation cutscene** gets no track. It is a ~1.3 s freeze, so it is a
*duck* — the music drops under the pilot line and comes back — handled in code.

`battle_danger` is deliberately **shared** rather than per-pilot. Eight danger
variants would mean twenty-three tracks and you would hear each one rarely; one
shared escalation that cuts across whoever's theme is playing reads as the game
itself changing gear, which is the point.

---

## Battle music — how a track is chosen

A fight draws from **three candidates** and picks one at random:

```
theme_<player 1's mech>      the left pilot
theme_<player 2's mech>      the right pilot
stage_<arena>                the ground they are fighting over
```

So every match is one of three, and a rematch re-rolls. Both pilots' themes are
in the pool, not just yours — losing to a rival's theme, or fighting on the
stage's own, is the variety the roll buys.

**Rules around the roll:**

* **Mirror matches** collapse to two distinct candidates. The duplicate is
  removed rather than getting double weight.
* **Training** does not roll. It always uses `training`.
* **`battle_danger` still overrides** whichever track won, once either pilot
  drops under 25 % life.
* **A missing file falls through** to the next candidate, then to `battle`, then
  to silence. Never a request for a path that does not exist.

  > **As built (D60):** `pickBattleCue` rolls uniformly across the candidates
  > that *exist*, rather than rolling across all three and then falling through.
  > The two are identical once every battle candidate exists — the eight pilot
  > themes and every stage theme, which is now the case. They differ only
  > while the set is partial, and there roll-then-fall-through piles most matches
  > onto whichever candidate sits last in the list — losing exactly the variety
  > the roll is for, during the period it is least able to deliver it.

> **The roll must not touch the simulation's RNG.** `MatchSim` is seeded and
> `match.test.ts` asserts a bit-identical replay for the same seed and inputs.
> Drawing a track from that stream would shift every subsequent random number
> and change the fight. Music is presentation: it rolls from its own source, in
> the scene layer, never in the sim.

---

## Pilot themes

One per pilot. Eight tracks, `theme_<mech>.mp3`.

| Cue name | Pilot | Character | BPM |
| --- | --- | --- | --- |
| `theme_halcyon` | NAIA VESK | Composed, professional, faintly arrogant | 176 |
| `theme_nocturne` | HALDEN ROOK | Older, scarred, unbothered | 172 |
| `theme_vesper` | KESTREL DOYNE | Quiet, watchful, still | 174 |
| `theme_terramoth` | BRUNN OKONKWO | Broad, calm, immovable | 168 |
| `theme_cirrus` | MIRA HOLLOWAY | Young, quick, grinning | 184 |
| `theme_obelisk` | SAAR TENGKU | Steady, patient, defensive | 170 |
| `theme_pyre` | RASA VOLKOV | Reckless, cheerful, unhinged | 186 |
| `theme_nulltide` | IO SENNA | Detached, clinical, unreadable | 178 |

The BPM spread is the roster's spread: TERRAMOTH's siege walker at 168 against
PYRE's brawler at 186 is the same 1.29-to-1.04 weight difference the chassis
scales already encode.

---

## Stage themes

One per arena, `stage_<arena>.mp3`.

**There is exactly one arena today.** CATHEDRAL YARD is hard-coded in
`render/Backdrop.ts` — three fixed parallax layers, no arena id, no arena data,
no selection screen. So this section has one row, and the third slot in every
battle roll resolves to the same track until a second arena exists.

| Cue name | Arena | BPM |
| --- | --- | --- |
| `stage_cathedral_yard` | CATHEDRAL YARD | 175 |

Adding an arena later means adding one row here and one line of data — the
selection logic takes the stage theme from the arena, so it needs no changes.
I have not written prompts for arenas that do not exist; when you know what the
next one is, that is a five-minute job.

---

# Prompts

Paste into Suno's **Style of Music** field in Custom mode.

## Screens

### `title`

```
Anime action opening theme, J-rock meets liquid drum and bass, 174 BPM, soaring
distorted electric guitar lead over rolling amen breaks, punchy high snare and
crisp hi-hats, driving fingered bass guitar, bright electro synth stabs and
arpeggios, heroic and euphoric, racing anime pop rock, wide stereo, big
cold-open energy, instrumental
```

### `menu`

```
Anime menu theme, J-rock and drum and bass hybrid, 172 BPM, restrained
palm-muted electric guitar, steady rolling breakbeat, warm fingered bass guitar
groove, glassy electro synth arpeggios, confident and forward-moving but leaving
space, mecha hangar readiness, instrumental
```

Deliberately the least busy track — it plays while someone reads menu items and
rebinds keys, so it must hold interest without demanding attention.

### `select`

```
Anime character select theme, high energy J-rock drum and bass, 176 BPM,
staccato palm-muted guitar chugs, rapid snare rolls and breakbeat fills, punchy
sub bass, rising electro synth risers, ticking anticipation, sports anime
pre-race tension, bright and impatient, instrumental
```

Anticipation rather than payoff — it resolves into a pilot theme, so it should
feel like it is leaning forward.

### `battle_danger`

```
Anime final stand theme, frantic J-rock drum and bass, 182 BPM, urgent tremolo
guitar and double-time snare rolls, hammering kick and punchy high drums,
distorted bass guitar, wailing electro lead, desperate and heroic last-round
intensity, racing game final lap, instrumental
```

Cuts across whichever pilot theme is playing, so it has to be the most generic
of the set on purpose — it belongs to the situation, not to a person.

### `results_win`

```
Anime victory theme, triumphant J-rock pop, 168 BPM, bright major key electric
guitar, celebratory snare fills, bouncy bass guitar, sparkling electro synth,
uplifting sports anime winner's circle, warm and satisfied, instrumental
```

### `results_lose`

```
Anime defeat theme, subdued J-rock, 140 BPM, clean reverbed electric guitar,
restrained drums over a slow breakbeat, melancholy minor key bass line, distant
electro pads, wistful and reflective but still resolute, instrumental
```

The only track that breaks the high-BPM rule, on purpose — the one moment in the
game that should not be urging you forward. Resolute, not miserable: the next
screen offers a rematch.

### `training`

```
Anime training theme, laid-back J-rock drum and bass, 170 BPM, clean funky
electric guitar, relaxed liquid breakbeat, warm rounded bass guitar, mellow
electro keys, focused and unhurried, practice range, loops without fatigue,
instrumental
```

Training has no timer and no opponent, so people sit in it a long time. Lowest
fatigue in the set.

### `archive`

**This is the one track that deliberately leaves the house style.** No J-rock, no
drum and bass, no guitars. See the note below before changing it.

```
Ambient cinematic archive theme, 72 BPM, slow sparse solo piano with long pauses
between phrases, warm analogue synth pads swelling underneath, soft low sine
bass, faint tape hiss and distant data static, occasional single bell tone, no
drums or the barest slow heartbeat pulse, calm reverent and unhurried, quiet
room of old records at night, spacious reverb, deeply low key, instrumental
```

Everything else in this document exists to make sixteen separately generated
tracks sound like one album, and every other prompt therefore repeats the shared
J-rock and drum-and-bass descriptors. **This one must not.** The Archive is the
only screen in the game with no opponent, no clock, no decision and nothing to
react to — the activity is *reading*, for minutes at a time. Racing-anime pop
rock behind a page of prose does not read as atmosphere, it reads as the game
having forgotten which screen you are on.

So: 72 BPM against `results_lose`'s 140, which was previously the slowest thing
here by a wide margin. Piano and pads instead of guitar. Drums optional and
barely there. The Archive is somewhere you *stay*, and the music has to survive
being listened to rather than played over.

Two threads keep it in the same world rather than sounding like a different
game's soundtrack:

* **The cold electro pads and data static** are lifted straight from
  `theme_nulltide`, the most electronic track in the set. This is a Concord
  records system, not a library. Keep the static faint — and note that when the
  campaign starts gating entries behind progression, that texture becomes the
  sound of the parts you have not unlocked yet.
* **The piano is the counterweight**, because the Archive is mostly about people:
  eight of its eighteen entries are pilots, and the machines are written through
  the people who built and fly them.

If Suno drifts back toward a beat, push it further down rather than pulling the
tempo up. Too quiet is the correct failure here.

---

## Pilot themes

### `theme_halcyon` — NAIA VESK

*Composed, professional, slight edge of arrogance. The balanced ace.*

```
Anime ace pilot theme, polished J-rock drum and bass, 176 BPM, clean confident
lead guitar melody with precise phrasing, tight rolling breakbeat, smooth
driving bass guitar, bright electro synth, poised and effortlessly superior,
protagonist swagger, racing game pop rock, instrumental
```

The closest thing the soundtrack has to a main theme — she is the reference
chassis and the tutorial pick. Polished rather than loud.

### `theme_nocturne` — HALDEN ROOK

*Late-forties assault veteran. Scarred, unbothered.*

```
Anime veteran rival theme, heavy J-rock drum and bass, 172 BPM, thick detuned
guitar riffs, half-time feel over a rolling breakbeat, growling distorted bass
guitar, scorched electro lead, weathered and immovable, unhurried menace,
instrumental
```

The half-time feel is the trick: same tempo as the others, but it *sits back*.
He is not in a hurry and the music should not be either.

### `theme_vesper` — KESTREL DOYNE

*Marksman. Quiet, watchful, still.*

```
Anime marksman theme, cold precise J-rock drum and bass, 174 BPM, sparse muted
guitar stabs with long silences between them, crisp clipped breakbeat, taut low
bass guitar, glassy icy electro arpeggio, patient and watchful, held breath
before the shot, instrumental
```

The one theme built around **space**. Everything else fills the bar; this one
leaves gaps, which is what makes it read as a sniper.

### `theme_terramoth` — BRUNN OKONKWO

*Siege walker. Broad, calm, immovable — industrial, not military.*

```
Anime siege machine theme, industrial J-rock drum and bass, 168 BPM, grinding
downtuned guitar chugs, heavy machine percussion and clanking metal hits,
enormous sub bass guitar, low electro drones, immovable and inevitable, slow
unstoppable advance, instrumental
```

Slowest of the eight, and the only one with industrial percussion — he is a
colliery pilot, not a soldier.

### `theme_cirrus` — MIRA HOLLOWAY

*Skirmisher. Young, quick, grinning.*

```
Anime speedster theme, bright fast J-rock drum and bass, 184 BPM, nimble clean
guitar runs, skittering rapid breakbeat and hyperactive hi-hats, bouncy popping
bass guitar, sparkling playful electro synth, cheeky and weightless, racing game
pop rock, instrumental
```

The most *Umamusume* of the set — this is where the racing-pop-rock touchstone
should be most audible.

### `theme_obelisk` — SAAR TENGKU

*Bulwark. Steady, patient, defensive.*

```
Anime bulwark theme, resolute J-rock drum and bass, 170 BPM, wide sustained
power chords, steady unwavering breakbeat, deep anchored bass guitar, solemn
electro pads under a hymn-like lead, patient and unbreakable, holding the line,
instrumental
```

Sustained chords against everyone else's staccato. He is the only pilot whose
theme should feel like it is standing still on purpose.

### `theme_pyre` — RASA VOLKOV

*Incendiary brawler. Reckless, cheerful, slightly unhinged.*

```
Anime pyromaniac theme, manic J-rock drum and bass, 186 BPM, wild bending guitar
leads and chaotic fills, frantic breakbeat with crashing cymbals, snarling
distorted bass guitar, screaming acid electro, gleeful and unhinged, everything
on fire and laughing, instrumental
```

Fastest and least tidy. The cheerfulness matters — she is not a villain, she is
having a wonderful time.

### `theme_nulltide` — IO SENNA

*Electronic warfare. Detached, clinical, unreadable.*

```
Anime electronic warfare theme, clinical glitch J-rock drum and bass, 178 BPM,
sterile processed guitar fragments, precise neurofunk breakbeat, surgical reese
bass, cold digital electro textures and static, detached and unreadable, systems
going dark, instrumental
```

The most electronic and least rock of the eight — guitar reduced to processed
fragments. She jams the other pilot's reactor; her music should sound like the
thing doing the jamming.

---

## Stage themes

### `stage_cathedral_yard` — CATHEDRAL YARD

*Night dockyard at altitude. Cold void above, warm haze below, cathedral-scale
girders in cold blue-grey, dust drifting through the light.*

```
Anime stage theme, cavernous J-rock drum and bass, 175 BPM, echoing
reverb-drenched guitar arpeggios over a rolling breakbeat, deep resonant bass
guitar, cold cathedral organ pads and distant electro bells, punchy high drums
with wide room reverb, vast night dockyard high above the clouds, awe and
altitude, instrumental
```

The only track in the set with **space around it** in the mixing sense — long
reverb tails and organ, taken straight from the backdrop's own gradient (cold
void at the top of the frame, warm dock haze at the bottom). It has to hold its
own against eight pilot themes it will be rolled against, so it leans on scale
rather than on aggression: it is the one theme that belongs to the *place*, and
neither fighter owns it.

---

## Optional

### `battle` — fallback

```
Anime battle theme, aggressive J-rock and drum and bass, 178 BPM, distorted
guitar riffs trading with rolling amen break drums, punchy high snare and tight
kick, driving distorted bass guitar, screaming electro lead, racing game pop
rock energy, relentless forward momentum, mecha dogfight, instrumental
```

Only used when a pilot theme is missing. Once all eight exist it never plays, so
generate it last or not at all — a missing pilot theme falling through to silence
is an acceptable failure mode and the code handles it either way.
