# CATHEDRAL YARD — source masters

The four files in `assets/arenas/` are what the game loads. Some of them are
**derived**, and this folder holds what they were derived from. Do not delete it:
one of the shipped files cannot be regenerated without its master.

Art direction and the full specification live in `docs/STAGE_ART_BRIEF.md`.

## What ships, and where it came from

| Shipped | Size | Source | Derivation |
| --- | --- | --- | --- |
| `arena_sky.png` | 3072 x 1024 | `sky_master_1536_lifted.png` | **Levels lifted, then mirrored.** See below. |
| `arena_far.png` | 3072 x 1024 | `far_master_1536.png` | **Mirrored.** See below. |
| `arena_haze.png` | 3072 x 1024 | `haze_master_1536.png` | **Mirrored**, same reason |
| `arena_mid.png` | 1536 x 1024 | `mid_master_1536.png` | Straight copy |
| `arena_near.png` | 1536 x 1024 | `deck_master_1536.png` | Straight copy |
| `arena_fore.png` | 1536 x 1024 | `fore_master_1536.png` | Straight copy |

`arena_haze.png` is the mid-distance band between `far` and `mid`, added because
the stack had a factor-of-three gap in its scroll rates (0.06 to 0.18) and read
as two flats. It scrolls at 0.11. Its master ran off both edges exactly as the
far layer's did — 106 of 256 rows, mismatch up to 113 — and is mirrored by the
same recipe.

### `arena_sky.png` has its levels corrected, and that is not optional

As delivered the sky measured luminance **15/23/31/43/88** by fifths, against a
gradient pitched at 22/44/66/80/86. Dropped in as-is it composited to about **35
in the band `arena_far` occupies, against that strip's ~89** — a ratio of 2.5,
where the procedural gradient it replaced had been 1.35. The far layer stopped
reading as distant fog and began glowing against a void, which a player reported
immediately.

**Neither alpha nor tint can fix this.** Tint only multiplies down; alpha only
blends toward whatever is behind. Raising a backdrop has to happen in the asset.

`sky_master_1536_lifted.png` applies a shadow lift — `new = old + L(1 - old/255)`
with `L` a smoothstepped hump across the height, peaking around 37 at 65 % down
and tapering to 0 at both ends. That form raises the dark sky field while leaving
the stars, already near maximum, essentially untouched. Result **24/42/60/68/96**,
and a far-to-sky ratio back at 1.3–1.5.

Rebuild it from the *unlifted* master with the same curve if the art changes; do
not lift an already-lifted file. It then mirrors to 3072 like the others, and
scrolls at 0.02 — the sky is the one thing genuinely at infinity.

Two candidates were delivered. The one not used was 1672x941 and brighter
(mean 59.6, SD 41.3) with roughly twice the edge mismatch; this one is 1536x1024,
matching every other layer, mean 46.3 and SD 35.2. **It is easier to lift a dark
backdrop than to tame a bright one**, and that decided it.

### `arena_far.png` is the one that matters

The delivered far layer ran off both edges and did not tile — 78 of 256 sampled
rows had content at an edge, with alpha mismatches up to 255. It is shipped as
`[A | mirror(A)]`, which tiles exactly by construction: the interior join is A's
right edge against its own mirror, and the wrap join is A's left edge against its
own mirror. Measured wrap-seam mismatch afterwards: **0**.

Undetectable in play because the far layer is fog, scrolls at 0.06 and is tinted
and faded on top of that. To rebuild it:

```python
from PIL import Image, ImageOps
src = Image.open('source/far_master_1536.png').convert('RGBA')
w, h = src.size
out = Image.new('RGBA', (w * 2, h), (0, 0, 0, 0))
out.paste(src, (0, 0))
out.paste(ImageOps.mirror(src), (w, 0))
out.save('arena_far.png')
```

## The deck's contact row is a measured constant

`Backdrop.NEAR_LIP_ROW` is **748** — the first fully opaque row of
`arena_near.png`, measured per column (747 lowest, 752 highest, median 748). The
engine positions the strip so that row lands exactly on `DECK_Y`, which is what
makes the drawn floor and the floor the simulation stands machines on the same
line.

**Re-measure it whenever the deck art changes.** Nothing warns you when it moves,
and the arena has already shipped once with the two floors in different places.

```python
from PIL import Image
im = Image.open('arena_near.png').convert('RGBA'); px = im.getchannel('A').load()
w, h = im.size
tops = [next(y for y in range(h) if px[x, y] >= 250) for x in range(0, w, 8)]
print(sorted(tops)[len(tops)//2])   # -> NEAR_LIP_ROW
```

## Other files

* `fore_master_v1_rejected.png` — the first foreground pass. Kept because the art
  is good and only the *composition* was wrong: it came back as a proscenium
  frame with a beam spanning the full width across the top (97 % of the top band
  covered) and a continuous band across the bottom (100 %). In a game where
  machines fly to the ceiling and land on the deck, anything crossing the top or
  bottom of the frame hides gameplay. The accepted version replaced it with two
  free-standing columns and an 864px clear span; 0 rows span the full width.
* `blender_far/mid/near.png` — the original procedural strips built by
  `tools/blender/build_arena.py`, which these replaced.

## Expect tiling to fail

Five of the six delivered layers did not tile. Two happened to be safe because
their structure did not reach the image edges; the far layer had to be mirrored.
**Assume seamlessness is the engine's job, not the generator's**, and measure it
rather than trusting it:

```python
left  = [im.getpixel((0, y))       for y in range(0, h, 4)]
right = [im.getpixel((w - 1, y))   for y in range(0, h, 4)]
print(max(abs(l[3] - r[3]) for l, r in zip(left, right)))   # 0 = seamless
```
