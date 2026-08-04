# Mech surface textures — provenance

Four maps, used by `make_material()` in `tools/blender/build_mechs.py` to give the
armour real surface wear instead of procedural noise alone.

**All source material is CC0** (Creative Commons Zero, public domain) from
[Poly Haven](https://polyhaven.com/license) — commercial use and redistribution
permitted, attribution not required. Nothing here restricts shipping the game.

## What ships here, and where it came from

These are **derived and fully regenerable** — unlike `assets/arenas/source/`,
nothing here is a master that cannot be rebuilt. The originals are deliberately
*not* committed: they are 25 MB against 612 KB, and they are one `curl` away.

| File | 512², from | Source URL (1K PNG) |
| --- | --- | --- |
| `plate_wear.png` | `blue_metal_plate` diffuse → autocontrast → L | `…/blue_metal_plate/blue_metal_plate_diff_1k.png` |
| `plate_rough.png` | `blue_metal_plate` roughness → **scaled** from 16-bit | `…/blue_metal_plate/blue_metal_plate_rough_1k.png` |
| `plate_nor.png` | `blue_metal_plate` normal (OpenGL) | `…/blue_metal_plate/blue_metal_plate_nor_gl_1k.png` |
| `rust_mask.png` | `rust_coarse_01` diffuse → autocontrast → L | `…/rust_coarse_01/rust_coarse_01_diff_1k.png` |

Base URL: `https://dl.polyhaven.org/file/ph-assets/Textures/png/1k`

## The 16-bit roughness map will silently flatten if you convert it naively

`blue_metal_plate_rough_1k.png` is mode **`I;16`**, holding 0–65535. Its real
range is 8951–65529, i.e. nearly the full span. `Image.convert('L')` **clamps
rather than scales**, so everything above 255 becomes white and the map comes out
*completely flat* — mean 255.0, SD **0.0**.

That is the dangerous kind of wrong: a flat roughness map does nothing, costs
nothing, and raises no error. The conclusion it invites — "roughness variation
does not help" — would have been false. Scale it:

```python
im = Image.open(src)
if im.mode in ('I;16', 'I'):
    im = im.point(lambda v: v * (255.0 / 65535.0)).convert('L')
```

**Check every processed map has variation before trusting it:**

```python
px = list(Image.open(f).convert('L').get_flattened_data())
m = sum(px)/len(px); print(m, (sum((p-m)**2 for p in px)/len(px))**0.5)   # sd 0 = dead
```

Current values, for comparison after any rebuild:

| File | mean | SD | min–max |
| --- | --- | --- | --- |
| `plate_wear.png` | 88.0 | 42.6 | 0–255 |
| `plate_rough.png` | 72.0 | 12.6 | 38–229 |
| `plate_nor.png` | 142.2 | 1.3 | 122–159 |
| `rust_mask.png` | 106.2 | 47.9 | 0–255 |

`plate_nor.png` is genuinely almost flat — SD 1.3 — because a painted steel plate
*is* almost flat. It is a whisper of surface break-up, not a detail map, and that
is correct. Do not "fix" it by raising its strength; raise the bump node instead
if more is wanted.

## Why these two, and why they are used as masks

The parts are **35–100 logical px on screen**. Detail finer than that becomes
halftone mush — the same lesson the procedural panel-seam grid already learned in
`make_material`. What matters is whether a texture's *large-scale* structure
survives a brutal downsample. Both of these do:

| | SD @512 | SD @64 | SD @32 |
| --- | --- | --- | --- |
| `rust_coarse_01` | 12.9 | 11.6 | **11.3** |
| `blue_metal_plate` | 7.5 | 6.9 | **6.7** |

Roughly 88 % of the contrast survives to 32 px, so the blotches and panel seams
still read on a small part.

**They drive masks, roughness and bump — never albedo colour directly.** Three
reasons, all of them binding:

1. The palette rule in `build_mechs.py` requires the identity hue to dominate the
   surface, because eight machines have to be told apart instantly at gameplay
   scale. Photographic albedo would desaturate every one of them toward the same
   brown-grey.
2. Fine photographic detail does not survive to sprite size anyway.
3. The stage is **painted**, not photoreal. Photoreal mechs would not match it —
   they would clash in a new direction.

The rust tint is taken from the texture rather than invented: its mean is hue
**23.8°**, which sits beside the deck's sodium practicals at **30.3°**. Same warm
family, so the oxide reads as native to CATHEDRAL YARD.
