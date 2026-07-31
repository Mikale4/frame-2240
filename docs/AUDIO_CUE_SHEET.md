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
3. **Output filenames are auto-derived from the prompt text** — specifically
   `sfx_<first 5 characters>_<timestamp>.mp3`. Files arrive named after their
   description and must be renamed to the Name column, because the game loads by
   name. **Two calls whose prompts share their first five characters and land in
   the same second will silently overwrite each other**, so never issue such a
   pair in one parallel batch. See *Variations* below for why this matters most.

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

> **Cost — measured, no longer a guess.** Sound effects bill at roughly
> **11–12 credits per second** of requested duration, so a 0.5 s minimum-length
> cue costs about **6 credits**. Spent so far: **~225 credits** for the priority
> 15 and their revisions. The remaining files are ~34 s ≈ **400 credits**,
> putting the finished set near **625 credits** — about **0.5 %** of the 130,800
> quota. Read cost as the *delta* on `user/subscription` → `character_count`; the
> `usage/character-stats` breakdown reports the same delta but sits a constant
> +200 higher, which is what caused an early 35× overestimate.

## Writing prompts that land

Batch one was reviewed by ear and **eight of fifteen cues were rejected**. Five
failed because of a single phrase in the prompt actively steering the model
wrong. These are the rules that came out of it — they matter more than the
prompt text itself.

**Phrases that broke things:**

| Phrase | What it produced | Use instead |
| --- | --- | --- |
| "futuristic", "sci-fi" *(on a physical object)* | A synthy zap with no mechanism | Name the real mechanism: gunpowder, breech, casing |
| "metallic ping" | A hammer hitting a nail | "dense", "thick low thud", "solid" |
| "sharp pop" | A literal small pop; the larger event vanished | Describe the event's stages explicitly |
| "pressurised air release" | A pneumatic valve hiss | "rocket ignition", "roaring jet flame" |
| "burst" *(for a dash)* | A stationary thruster firing | Say the **body moves**: "surges away", "rushing air" |
| "skipping off", "glance" | Near-silent output, 20–40 dB down | "loud", "hard", "close", "forceful" |
| "crystalline", "resonant snap" | An 8-bit laser, not a physical deflection | "metallic clang", "metal-on-metal" |
| "sharp cracking blast" | Did not read as an explosion at all | Name the device: "bomb", "grenade", "charge" |

**Light-contact language makes quiet files.** This is the least obvious rule
here. Prompts describing a glancing or delicate interaction produce output
20–40 dB below the rest of the set — the model renders the *scale* implied by the
verb, not just the timbre. Every near-silent file in batch two used a word like
"skipping", "glance" or "soft". Rewriting with "loud / hard / close / forceful"
fixed each one on the first retry.

**"Too soft" usually means character, not volume.** A cue can peak at 0 dB and
still fail for sounding lightweight. The fix is mass vocabulary — "colossal",
"crushing", "real weight", "immense" — not amplification.

**What works:**

* **Name the object and its scale.** "Thick armour plating of a giant war
  machine" beats "mech armour" every time. The model renders mass when told.
* **Describe multi-stage events as stages.** A missile is rail clunk → motor
  ignition → receding roar. Given one noun it renders one noise.
* **Give the sound room.** If a cue reads as three stages, 0.3 s cannot hold it.
  Three cues here had their duration raised for exactly this reason.
* **Specify weight explicitly** — "sub-bass", "concussive", "deep booming",
  "immense". Absent that, output skews bright and small.
* **"dry, no reverb" works** and should stay on every combat cue.

## Format

* **`mp3_44100_192`** — the highest bitrate the account tier allows. 192 kbps
  needs Creator tier or above, which this account has. `pcm_44100` would need
  Pro, and the game does not need it: these are short, heavily-layered combat
  cues, not music.
* **Trim silence** from the head — these are gameplay cues and any leading pad
  reads as input lag. Trim the tail down to the target duration too.
* **Normalise to about −6 dBFS peak**, except where noted. Relative loudness is
  handled in-game, so consistent peaks make mixing predictable.
  **This pass is not optional.** Generated output level varies enormously between
  calls — batch two arrived spanning −41 dB to 0 dB peak. Re-rolling the worst
  offenders narrowed it to −15.5 dB to 0 dB, but only normalisation makes it
  uniform. Measure with:

  ```text
  ffmpeg -i <file> -af volumedetect -f null NUL
  ```

  which reports `max_volume` and `mean_volume`. Anything below about −12 dB peak
  is effectively inaudible next to the rest and should be re-rolled *before*
  normalising, since amplifying a −40 dB file by 34 dB brings its noise floor up
  with it.
* **No reverb tails** on the short combat cues. The game layers many at once and
  tails turn a firefight into mud.

### Variations

Where variations are listed, generate that many takes and name them `_1`, `_2`,
… — the game picks randomly to stop repetition fatigue. **Reword the opening of
the prompt for each take** rather than resubmitting identical text. This does two
jobs at once: it produces genuinely different takes instead of near-duplicates,
and it keeps the auto-derived filenames distinct, which is what prevents the
same-prefix overwrite described above.

## Naming

`assets/audio/<name>.mp3`, exactly as in the Name column.

---

## 1. Weapons — firing

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `fire_vulcan` | 0.10 s | 4 | HALCYON's rapid rifle. Fires in bursts, so it must not fatigue. A **single** round — the game triggers it per shot. | "Aggressive heavy machine gun firing one round, thunderous gunpowder blast with a metallic action clack and casing eject, powerful and close, dry" |
| `fire_autocannon` | 0.14 s | 4 | NOCTURNE's heavier rotary cannon round. | "Large autocannon firing one round, deep booming muzzle blast with a massive metallic breech slam, low-end power, dry" |
| `fire_heavy` | 0.30 s | 2 | Charged single slug/breaker shot. Must read as heavy *machinery*, not just a loud noise. | "Colossal siege cannon firing a massive slug, crushing sub-bass detonation with a violent steel recoil slam, immense and devastating, dry" |
| `fire_beam` | 0.45 s | 2 | The lance beam. Big, electrical, the most expensive shot in the game. | "Massive energy cannon firing a beam, deep sub-bass detonation under a searing electrical discharge, immense weight and presence, dominating, dry" |
| `fire_missile` | **0.60 s** | 3 | Missile leaving a rack. Raised from 0.30 s — a launch is three stages and cannot fit in less. | "Rocket missile launching from a tube, metallic rail clunk then the solid rocket motor igniting into a violent roaring whoosh as it streaks away into the distance" |
| `fire_scatter` | 0.18 s | 2 | The 5-way scatter burst. | "Wide scatter cannon firing, several heavy rounds blasting outward at once, thick overlapping muzzle reports, powerful, dry" |

## 2. Weapons — impact

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `hit_light` | 0.14 s | 4 | Small round hitting armour. Very frequent. | "Hard bullet impact on heavy steel armour, loud dense metallic slam, close and forceful, dry" |
| `hit_heavy` | 0.35 s | 3 | Heavy shot, beam or sword connecting. Should feel expensive. | "Crushing strike caving in steel plating, deep resonant metallic crunch with tearing metal and debris, powerful, no reverb" |
| `hit_guard` | 0.16 s | 3 | Shot stopped by a held guard. Physical deflection — **not** an energy zap. | "Loud ricochet off armoured shield plating, hard bright metallic clang, forceful and close, dry" |
| `hit_absorb` | 0.22 s | 2 | Barrier absorbing a shot and converting it to meter. Should sound *rewarding*, and must not read as a slash. | "Energy barrier swallowing an incoming shot, soft muffled thump absorbed into a warm rising electronic charge-up, rewarding and clean, no whoosh" |

## 3. Melee

The sword chain runs six swings for HALCYON and three for NOCTURNE, escalating
into a finisher. `melee(stage)` is called with the swing index, so pitch/weight
should climb across the set.

> **Renamed.** These were `melee_swing_1/2/3`, which collided with the variation
> suffix and produced `melee_swing_1_1.mp3`. The loader maps stage index → name
> through a table either way, so descriptive names cost nothing and read better.

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `melee_swing_light` | 0.20 s | 2 | First swings of a chain. Fast, light. | "Energy blade swinging fast through air, sharp electric whoosh, short" |
| `melee_swing_mid` | 0.24 s | 2 | Mid-chain. Heavier. | "Glowing energy sword heavy swing through air, deep electric whoosh with a metallic humming edge, weighty" |
| `melee_swing_finish` | 0.40 s | 1 | The finisher. The biggest swing in the game. | "Massive energy greatsword finishing slash, deep powerful whoosh with a bright electric crack" |
| `melee_ignite` | 0.35 s | 1 | Beam saber igniting as a sequence opens. | "Energy blade igniting and extending, rising electrical hum snapping into a steady sustain" |
| `melee_claw` | 0.28 s | 2 | NOCTURNE's siege claw instead of a beam. Mechanical, not energy. | "Gigantic hydraulic claw slamming shut, heavy steel jaws crashing together with a pneumatic ram, industrial and powerful, dry" |

## 4. Movement

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `dash` | 0.28 s | 3 | Boost dash burst. Very frequent — keep it light. Must read as the **machine moving forward**, not a thruster idling. | "Giant armoured machine boosting suddenly forward, explosive rocket thruster burst launching it into motion with a fast powerful whoosh of displaced air rushing past, heavy and forceful, dry" |
| `takeoff` | 0.45 s | 1 | Leaving the ground into flight mode. | "Towering machine lifting off, rocket thrusters spooling up into a powerful roaring lift with heavy mechanical servos, dry" |
| `land` | 0.40 s | 2 | Feet hitting the deck. Should feel heavy. | "Heavy mech landing on a metal deck, huge metallic impact with servo settle and debris" |
| `footstep` | 0.22 s | 4 | One step of the walk cycle while grounded. **Not yet triggered in code.** | "Enormous mech foot slamming onto metal plating, deep resonant metallic boom with hydraulic whine and real weight, dry" |
| `thruster_loop` | 2.0 s, **seamless loop** | 1 | Sustained hover/boost bed. Normalise quieter, about −14 dBFS. | "Steady rocket thruster hum, low continuous jet drone, seamless loop, constant with no variation" |

## 5. Defence and meter

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `barrier_burst` | **0.80 s** | 1 | Barrier activation. Raised from 0.35 s — grandeur needs room to bloom. | "Immense energy barrier erupting outward, deep resonant bass swell blooming into a wide shimmering harmonic wash, majestic and grand, sci-fi force field expanding" |
| `guard_break` | 0.70 s | 1 | Barrier broken — a punishing, alarming moment. | "Shield shattering violently, glassy crystalline break collapsing into a low descending alarm, harsh and punishing" |
| `saturation` | 1.10 s | 1 | Overdrive activating. The biggest positive sound in the game. | "Powerful sci-fi overdrive activation, deep rising surge into a triumphant electronic bloom" |
| `mode_cycle` | 0.10 s | 1 | Switching saturation mode. Small, crisp, UI-like. | "Small electronic mode switch blip, clean crisp digital tick, short" |

## 6. Supporter drone

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `assist_order` | 0.22 s | 1 | Drone acknowledges an order. Should read as a *machine replying*. | "Small robot drone acknowledgement chirp, two rising electronic beeps, clean" |
| `assist_denied` | 0.20 s | 1 | Assist unavailable. Must be obviously negative. | "Negative electronic error buzz, short harsh descending denial tone, dry" |
| `assist_fire` | 0.26 s | 2 | The drone's own volley leaving it. Lighter than the mech's weapons. | "Compact drone launching mini missiles, quick light rocket launches with a soft hissing exhaust" |
| `drone_hover` | 2.0 s, **seamless loop** | 1 | Drone idle bed. Quiet, about −18 dBFS. | "Hovering drone idle bed, gentle high electric whir, seamless loop, constant" |

## 7. Status elements

Four elements, applied on a clean hit. Each needs to be identifiable *by ear*
alone, since they overlap with combat.

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `status_corrosive` | 0.55 s | 1 | Acid takes hold. | "Corrosive acid hissing and bubbling on hot metal, wet caustic sizzle, aggressive" |
| `status_cryo` | 0.55 s | 1 | Freezing. | "Flash freezing metal, sharp crystalline ice forming with a brittle crackle, cold" |
| `status_incendiary` | 0.55 s | 1 | Ignition. | "Metal catching fire, sharp fuel ignition whoosh blooming into a burning crackle" |
| `status_shock` | 0.55 s | 1 | Electrical disruption. | "High voltage electricity arcing over metal, crackling zap with a dying electrical buzz" |

## 8. Destruction

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `explode_small` | 0.55 s | 3 | Secondary blasts during a death spiral. Name an actual explosive device — abstract "blast" wording did not read as an explosion. | "Small bomb exploding, sharp percussive boom with a burst of fire and scattering metal fragments, dry" |
| `explode_big` | **3.00 s** | 1 | The kill. Should be the loudest thing in the game. Raised from 1.60 s — the debris tail was being cut off. Check this against the K.O. freeze length. | "Enormous explosion destroying a giant metal war machine, huge concussive detonation with a deep booming sub-bass blast wave, roaring fire, and a long tail of heavy metal debris crashing down" |
| `ko` | 1.40 s | 1 | The K.O. sting over the freeze. | "Dramatic sci-fi defeat sting, deep impact into a descending ominous tone" |

## 9. Interface

| Name | Duration | Variations | What it is | Suggested prompt |
| --- | --- | --- | --- | --- |
| `ui_move` | 0.06 s | 1 | Menu cursor movement. Extremely frequent — keep it tiny and quiet. | "Tiny crisp user interface navigation tick, clean short digital blip, very small" |
| `ui_confirm` | 0.14 s | 1 | Menu selection. | "Confident interface confirmation beep, short rising two-tone electronic accept, clean" |
| `ui_back` | 0.12 s | 1 | Cancel / back. **Not yet triggered in code.** | "Interface cancel tone, short descending electronic blip, clean" |
| `match_ready` | 1.00 s | 1 | "READY" banner at match start. **Spoken line, not an SFX** — see below. | voice: "GET READY!" |
| `match_fight` | 0.80 s | 1 | "FIGHT" banner as control unlocks. **Spoken line, not an SFX.** | voice: "ENGAGE!" |

### The spoken lines

`match_ready` and `match_fight` are the game's only voice cues, generated with
`text_to_speech` rather than `text_to_sound_effects`.

**They must be synthetic, not a cast human.** Four rounds were spent on premade
voices — Sarah, Laura, Lily, Jessica, Bella — pushed progressively harder toward
panic, and every one was rejected for the same reason: they are recordings of a
person. A mech's launch callout is a *machine* talking. The fix was not a better
performance, it was `text_to_voice`, which designs a voice from a description:

```text
text_to_voice(
  voice_description: "A synthetic robotic female combat computer voice. Clearly
    artificial and machine-generated, not a human being: cold digital vocoded
    timbre, metallic processed edge, slight electronic buzz and modulation, like
    a mech cockpit warning system. Speaks in urgent clipped alarm calls.",
  text: <~200 characters of cockpit chatter>
)
```

Voice design needs roughly 200 characters to demonstrate a timbre, so the
previews are ~15 s of warning chatter. That length is an artefact of the
audition, not of the cue — the delivered lines are ~1 s.

It returns **three** previews, and all three were saved with
`create_voice_from_preview`. Randomising between them was tried and reverted:
the launch callout is a single machine, and three channels read as three
different computers. **Only voice A ships.** The other two remain in the library
if a second speaker is ever wanted — a rival's cockpit, or a mission handler.

| Voice | ID | Used |
| --- | --- | --- |
| BSR Combat Computer | `4gYKUmr7Lmv9mUqSd3ki` | **yes** |
| BSR Combat Computer B | `ibHhxyUqkunHeFupWHYc` | held |
| BSR Combat Computer C | `ILqI22HjOfgHwbXQass7` | held |

Generate with `eleven_v3`, `stability: 0.15`, `style: 0.9`. The bracketed
direction is an **`eleven_v3` audio tag**: the model interprets it as delivery
instead of speaking it. Verify by duration — "GET READY!" lands at ~0.9 s,
whereas a spoken tag would run ~4 s. On a model without tag support the words are
read aloud, so always check the length after generating.

---

## Priority

If the whole set is too much in one pass, these fifteen carry most of the game's
feel — everything else can keep falling back to the synthesised version:

`fire_vulcan`, `fire_missile`, `fire_beam`, `hit_light`, `hit_heavy`,
`melee_swing_light`, `melee_swing_finish`, `melee_ignite`, `dash`, `land`,
`barrier_burst`, `saturation`, `assist_order`, `explode_big`, `ko`.

## Counts

**40 distinct cues; 71 files** once variations are included; two of them seamless
loops. (An earlier footer said 39 and 63 — both were miscounts. The figures above
come from summing the Variations column of the tables directly.)

### Progress

**Generation complete — all 71 files exist in `assets/audio/`.** Verified by
script against the tables above: no missing names, no unexpected files, every
file a valid MP3 and none undersized. Total 1.21 MB.

* **Batch one — 15 files**, the priority list, reviewed by ear. Eight were
  rejected and regenerated; two of those twice. The prompts in the tables above
  are the **approved** wording, not the originals.
* **Batch two — 56 files**, reviewed by ear. 13 cues were rejected across two
  problems: wrong character (`fire_heavy`, `hit_guard` ×2, `hit_absorb`,
  `explode_small` ×3, and the three "too soft" cues) and near-silent output
  (`fire_vulcan_2`, `fire_scatter_2`, `hit_light_3`, `melee_claw_2`,
  `fire_autocannon_2`/`_4`). All regenerated; three more that measured worse than
  anything flagged (`assist_fire_2` at −41.3 dB, `ui_move`, `mode_cycle`) were
  re-rolled at the same time.
* **`match_ready` / `match_fight` converted from SFX to spoken announcer lines.**
* **Total cost: ~790 credits** (~0.6 % of quota). Measured rate:
  **≈12 credits per second** for sound effects.
* Rejected takes are stashed outside the repo (session scratchpad,
  `rejected_batch1*/`) rather than deleted, in case a replacement is judged worse.

**Still to do on the audio itself:** every file is raw — 0.5 s minimum where the
target is shorter, untrimmed and unnormalised. Trimming to the Duration column
and normalising to ≈−6 dBFS is a separate pass. `_audition.html` in
`assets/audio/` plays the whole set in cue-sheet order for review; it is
regenerated from this document, so it cannot drift from the Name/Variations
columns.
