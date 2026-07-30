# Audio Cue Sheet

Every sound **Babel Sword: Reignition** currently triggers, for generation in
ElevenLabs (or any other source). Derived from `src/audio/Sfx.ts` and the call
sites in `BattleScene`, `TitleScene`, `Menu` and `BindingsPanel` — this is the
complete set, not a wish list.

Nothing in the game loads audio files yet. The current sounds are synthesised at
runtime with WebAudio. When these files exist, the loader gets wired in and the
procedural fallback stays as a safety net for anything missing.

## Generating with the ElevenLabs MCP

The server is configured in `.mcp.json` at the workspace root and exposes
`text_to_sound_effects`. Three constraints come straight from that tool and they
shape everything below:

1. **Duration must be between 0.5 and 5 seconds.** Many cues here are shorter
   than 0.5 s — `ui_move` wants 0.06 s. Generate those at **0.5 s** and trim the
   tail in post; the Duration column is the *target after trimming*, not the
   value to pass.
2. **`loop: true` is supported**, which is what the two loop beds need. Pass it
   for `thruster_loop` and `drone_hover` only.
3. **Output filenames are auto-derived from the prompt text**, so files arrive
   named after their description, not after the Name column. They have to be
   renamed to the Name column afterwards — the game loads by name.

Suggested call shape:

```text
text_to_sound_effects(
  text: <the prompt from the table>,
  duration_seconds: max(0.5, <duration>),
  output_format: "mp3_44100_192",
  output_directory: "Babel Sword Reignition/assets/audio",
  loop: <only for the two loop beds>
)
```

> **Cost.** Every call spends ElevenLabs credits from the account's plan quota.
> The full set is 63 calls; the priority subset at the bottom is 15. The
> published per-generation credit cost could not be confirmed from the docs, so
> **generate one cue first, read the remaining balance, and extrapolate** before
> committing to a full run.

## Format

* **`mp3_44100_192`** — the highest bitrate the account tier allows. 192 kbps
  needs Creator tier or above, which this account has. `pcm_44100` would need
  Pro, and the game does not need it: these are short, heavily-layered combat
  cues, not music.
* **Trim silence** from the head — these are gameplay cues and any leading pad
  reads as input lag. Trim the tail down to the target duration too.
* **Normalise to about −6 dBFS peak**, except where noted. Relative loudness is
  handled in-game, so consistent peaks make mixing predictable.
* **No reverb tails** on the short combat cues. The game layers many at once and
  tails turn a firefight into mud.
* Where **variations** are listed, generate that many takes of the same prompt
  and name them `_1`, `_2`, … — the game will pick randomly to stop repetition
  fatigue.

## Naming

`assets/audio/<name>.mp3`, exactly as in the Name column.

---

## 1. Weapons — firing

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `fire_vulcan` | 0.10 s | 4 | HALCYON's rapid rifle. Fires in bursts, so it must not fatigue. | "Short punchy futuristic rifle shot, mechanical, dry, tight transient, no reverb" |
| `fire_autocannon` | 0.14 s | 4 | NOCTURNE's heavier rotary cannon round. | "Heavy automatic cannon shot, deep mechanical thud with metallic snap, dry" |
| `fire_heavy` | 0.30 s | 2 | Charged single slug/breaker shot. | "Powerful mech cannon firing a heavy slug, deep bass thump with mechanical recoil clank" |
| `fire_beam` | 0.45 s | 2 | The lance beam. Big, electrical, the most expensive shot in the game. | "Sci-fi energy lance discharge, rising electrical charge into a sustained beam release, powerful" |
| `fire_missile` | 0.30 s | 3 | Missile leaving a rack. | "Missile launch from a mech pod, sharp pop then a hissing rocket exhaust, dry" |
| `fire_scatter` | 0.18 s | 2 | The 5-way scatter burst. | "Wide shotgun-like energy burst, multiple simultaneous projectile pops, mechanical" |

## 2. Weapons — impact

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `hit_light` | 0.14 s | 4 | Small round hitting armour. Very frequent. | "Bullet impacting thick metal armour plate, sharp metallic ping with a dull body, dry" |
| `hit_heavy` | 0.35 s | 3 | Heavy shot, beam or sword connecting. Should feel expensive. | "Massive impact on mech armour, deep metallic crunch with debris, powerful, dry" |
| `hit_guard` | 0.16 s | 3 | Shot stopped by a held guard. | "Energy shield deflecting a projectile, bright glassy metallic ricochet, short" |
| `hit_absorb` | 0.22 s | 2 | Barrier absorbing a shot and converting it to meter. Should sound *rewarding*. | "Energy shield absorbing a projectile, rising electronic swallow, clean sci-fi, no reverb" |

## 3. Melee

The sword chain runs six swings for HALCYON and three for NOCTURNE, escalating
into a finisher. `melee(stage)` is called with the swing index, so pitch/weight
should climb across the set.

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `melee_swing_1` | 0.20 s | 2 | First swings of a chain. Fast, light. | "Energy blade swinging fast through air, sharp electric whoosh, short" |
| `melee_swing_2` | 0.24 s | 2 | Mid-chain. Heavier. | "Energy sword heavy swing, deeper electric whoosh with metallic edge" |
| `melee_swing_3` | 0.40 s | 1 | The finisher. The biggest swing in the game. | "Massive energy greatsword finishing slash, deep powerful whoosh with a bright electric crack" |
| `melee_ignite` | 0.35 s | 1 | Beam saber igniting as a sequence opens. | "Energy blade igniting and extending, rising electrical hum snapping into a steady sustain" |
| `melee_claw` | 0.28 s | 2 | NOCTURNE's siege claw instead of a beam. Mechanical, not energy. | "Heavy hydraulic claw slamming shut, metal on metal, industrial, powerful" |

## 4. Movement

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `dash` | 0.28 s | 3 | Boost dash burst. Very frequent — keep it light. | "Mech thruster burst, sharp pressurised air release with a low whoomph, dry" |
| `takeoff` | 0.45 s | 1 | Leaving the ground into flight mode. | "Heavy mech lifting off, thrusters spooling up into a powerful lift, mechanical" |
| `land` | 0.40 s | 2 | Feet hitting the deck. Should feel heavy. | "Heavy mech landing on a metal deck, huge metallic impact with servo settle and debris" |
| `footstep` | 0.22 s | 4 | One step of the walk cycle while grounded. **New — not yet triggered in code.** | "Heavy mech footstep on metal decking, deep metallic clank with servo whine, dry" |
| `thruster_loop` | 2.0 s, **seamless loop** | 1 | Sustained hover/boost bed. Normalise quieter, about −14 dBFS. | "Steady mech thruster hum, low continuous jet drone, seamless loop, no variation" |

## 5. Defence and meter

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `barrier_burst` | 0.35 s | 1 | Barrier activation. | "Energy shield bursting outward, deep electronic whoomph with rising shimmer" |
| `guard_break` | 0.70 s | 1 | Barrier broken — a punishing, alarming moment. | "Energy shield shattering violently, glass-like electronic break into a low alarm drop" |
| `saturation` | 1.10 s | 1 | Overdrive activating. The biggest positive sound in the game. | "Powerful sci-fi overdrive activation, deep rising surge into a triumphant electronic bloom" |
| `mode_cycle` | 0.10 s | 1 | Switching saturation mode. Small, crisp, UI-like. | "Small electronic mode switch blip, clean digital tick" |

## 6. Supporter drone

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `assist_order` | 0.22 s | 1 | Drone acknowledges an order. Should read as a *machine replying*. | "Small robot drone acknowledgement chirp, two rising electronic beeps, clean" |
| `assist_denied` | 0.20 s | 1 | Assist unavailable. Must be obviously negative. | "Negative electronic buzz, short descending error tone, dry" |
| `assist_fire` | 0.26 s | 2 | The drone's own volley leaving it. Lighter than the mech's weapons. | "Small drone launching mini missiles, quick soft pops with rocket hiss" |
| `drone_hover` | 2.0 s, **seamless loop** | 1 | Drone idle bed. Quiet, about −18 dBFS. | "Small hovering drone idle, gentle high electric whir, seamless loop" |

## 7. Status elements

Four elements, applied on a clean hit. Each needs to be identifiable *by ear*
alone, since they overlap with combat.

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `status_corrosive` | 0.55 s | 1 | Acid takes hold. | "Corrosive acid hissing and bubbling on metal, wet caustic sizzle" |
| `status_cryo` | 0.55 s | 1 | Freezing. | "Flash freezing metal, sharp crystalline ice formation crackle" |
| `status_incendiary` | 0.55 s | 1 | Ignition. | "Metal catching fire, sharp fuel ignition whoosh into a burning crackle" |
| `status_shock` | 0.55 s | 1 | Electrical disruption. | "Electrical surge arcing over metal, crackling high voltage zap with a dying buzz" |

## 8. Destruction

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `explode_small` | 0.55 s | 3 | Secondary blasts during a death spiral. | "Small explosion on a metal hull, sharp crack with metallic debris, dry" |
| `explode_big` | 1.60 s | 1 | The kill. Should be the loudest thing in the game. | "Enormous mech explosion, deep bass detonation with a long metallic debris tail" |
| `ko` | 1.40 s | 1 | The K.O. sting over the freeze. | "Dramatic sci-fi defeat sting, deep impact into a descending ominous tone" |

## 9. Interface

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `ui_move` | 0.06 s | 1 | Menu cursor movement. Extremely frequent — keep it tiny and quiet. | "Tiny crisp UI navigation tick, clean digital blip" |
| `ui_confirm` | 0.14 s | 1 | Menu selection. | "Confident UI confirmation beep, short rising two-tone electronic accept" |
| `ui_back` | 0.12 s | 1 | Cancel / back. **New — not yet triggered in code.** | "UI cancel tone, short descending electronic blip" |
| `match_ready` | 1.00 s | 1 | "READY" banner at match start. | "Sci-fi match start alert, rising alarm into a clean confirmation tone" |
| `match_fight` | 0.80 s | 1 | "FIGHT" banner as control unlocks. | "Aggressive sci-fi engagement klaxon, short punchy alert burst" |

---

## Priority

If the whole set is too much in one pass, these fifteen carry most of the game's
feel — everything else can keep falling back to the synthesised version:

`fire_vulcan`, `fire_missile`, `fire_beam`, `hit_light`, `hit_heavy`,
`melee_swing_1`, `melee_swing_3`, `melee_ignite`, `dash`, `land`,
`barrier_burst`, `saturation`, `assist_order`, `explode_big`, `ko`.

## Counts

39 distinct cues; 63 files once variations are included; two of them seamless
loops.
