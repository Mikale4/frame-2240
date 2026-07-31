# Pilot Portrait Spec

Eight pilot portraits, one per chassis, used on the mech select screen and as
thumbnails during in-battle banter.

These are **hand-authored or externally generated art** — the Blender pipeline
that builds the mechs cannot produce them. It works in boxes, wedges and
cylinders, which is right for hard-surface machinery and wrong for faces. An
attempt at helmeted 3D busts is kept at `renders/debug/` for reference; it reads
as a robot head, not a character, and is not the intended direction.

## What the game expects

| | |
| --- | --- |
| Location | `assets/sprites/pilots/` |
| Portrait | `<mech_id>.png` — **256 × 256** |
| Thumbnail | `<mech_id>_thumb.png` — **96 × 96** |
| Format | PNG, RGBA |
| Background | Transparent **or** flat chroma — see below |

`mech_id` is one of: `halcyon`, `nocturne`, `vesper`, `terramoth`, `cirrus`,
`obelisk`, `pyre`, `nulltide`.

**A flat background is fine.** Generators usually cannot produce true
transparency, so deliver on flat green (`#00FF00`) or magenta and it gets keyed
out and resized here:

```bash
ffmpeg -i raw.png -vf "colorkey=0x00FF00:0.30:0.10,scale=256:256:flags=neighbor" -y halcyon.png
```

`flags=neighbor` matters — bilinear scaling turns pixel art to mush. Do not
anti-alias the outer edge against the chroma colour, or the key leaves a green
fringe.

## Framing

**Bust only**: head, shoulders, upper chest. Head occupies roughly the top two
thirds. Face and expression visible — these are characters, not helmets. Front
or slight three-quarter view, consistent across all eight so the select screen
does not jitter as the cursor moves.

The thumbnail is a **tighter crop of the same art**, not a shrunken copy: head
and shoulders only, since at 96 px a full bust loses the face.

## Style

Anime pixel art, readable at 96 px. Consistent light direction, palette depth
and outline weight across the set — eight portraits in eight styles reads as
placeholder art no matter how good each one is.

> **Original characters only.** Emulate the *style*; do not reproduce an existing
> character's design. CLAUDE.md requires original characters throughout.

## The pilots

Genders and ages below are the intended cast — four women, four men, spread
across ages so the roster does not read as eight variations of one person.
Nothing in code depends on them, so change any of it freely; just tell me, and
I will update this document to match.

Each description ties the pilot to their machine: the accent colour is that
mech's palette, so portrait and mech read as belonging together.

### `halcyon` — NAIA VESK · Concord Skyward
**Woman, early 30s.** Balanced interceptor ace. Composed, professional, slight edge of arrogance.
Short dark hair, flight suit in **azure blue** with **hot orange** trim, collar
open, headset around the neck rather than worn.

### `nocturne` — HALDEN ROOK · Emberline Pact
**Man, late 40s.** Heavy assault veteran. Older, scarred, unbothered. Cropped grey hair, heavy
**deep crimson** armoured suit with **cyan** piping, high armoured collar.

### `vesper` — KESTREL DOYNE · Concord Skyward
**Man, late 20s.** Marksman. Quiet, watchful, still. Long pale hair tied back, **teal** flight suit
with **sulphur yellow** optic trim, a slim targeting monocle over one eye.

### `terramoth` — BRUNN OKONKWO · Ironwake Colliery
**Man, 50s.** Siege walker pilot. Broad, calm, immovable — industrial rather than military.
Shaved head, **ochre** work suit with **amber** hazard striping, heavy collar,
welding goggles pushed up on the forehead.

### `cirrus` — MIRA HOLLOWAY · Free Latitude
**Woman, early 20s.** Skirmisher. Young, quick, grinning. Messy light hair, minimal **silver-white**
suit with **cyan** running lights, lightest kit of the roster.

### `obelisk` — SAAR TENGKU · Ironwake Colliery
**Man, 40s.** Bulwark pilot. Steady, patient, defensive. Braided dark hair, heavy **violet**
armoured suit with **pale lilac** shield glow at the shoulders.

### `pyre` — RASA VOLKOV · Ashfall Irregulars
**Woman, mid 20s.** Incendiary brawler. Reckless, cheerful, slightly unhinged. Wild red-orange hair,
scavenged **industrial orange** gear, mismatched pauldrons, soot-marked face,
goggles with **amber** lenses.

### `nulltide` — IO SENNA · Free Latitude
**Woman, 30s.** Electronic warfare. Detached, clinical, unreadable. Straight black hair with a
blunt fringe, near-black **slate** suit with **electric cyan** circuit tracing,
a thin sensor headset across one temple.

## After delivery

Drop the raw files anywhere and say where. They get keyed, resized, thumbnailed
and committed, and `MechSelectScene` picks them up by name with no code change —
the screen is built to this spec ahead of the art.
