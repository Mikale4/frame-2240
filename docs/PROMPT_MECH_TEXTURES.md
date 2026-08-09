# Mech Surface Textures — Asset Sheet Brief

**Revision 2.** Round 1 was generated and rejected; §5 is the post-mortem and it
is the most important section in this file. The prompt below is rewritten around
what went wrong.

Paste **§2 and §3** to the model. Attach **`docs/MECH_ROSTER_CONTEXT.md`**, which
carries the roster, the pilots and the faction origins that decide what each tile
should look like.

This is not a request for mech art. The machines are 3D models rendered to sprite
parts; this brief commissions the **tiling surface material** projected onto them.
§4 explains what the engine does with each map, and it is worth reading before
generating, because these are **masks, and their polarity is load-bearing**.

---

## 1. What exists now, and why this is being commissioned

`assets/blender/textures/` holds three 512² greyscale maps — `plate_wear.png`,
`plate_rough.png`, `rust_mask.png` — derived from CC0 Poly Haven scans. Verified
live in Blender: **74 materials, 40 of them textured, and all 40 share those same
three images.** Five factions differ only by scalar multipliers on one shared set.

So Ironwake's sixty-year-old ore walker and Concord's certified airframe wear
identical blotches at different strengths. **This sheet gives each of the five
powers its own surface vocabulary.**

The existing three maps stay. Nothing here overwrites a working asset.

---

## 2. THE PROMPT

> I need a set of **tiling greyscale surface-texture maps** for an original 2D
> mecha combat game. The machines are 3D models rendered to flat sprites, and
> these maps are projected onto their armour to give it real surface wear.
>
> **These are material maps, not artwork.** The target is a photographic scan of
> a square metre of worn painted steel, flattened and desaturated. There is no
> subject, no composition and no focal point — just an even field of surface.
>
> **Eleven tiles**, listed in the table below with a filename and a description.
> The attached context document explains the five factions these belong to and why
> each keeps its hardware differently. Read it: the difference between these tiles
> is the entire point of the commission.
>
> ### This is the second attempt. Read this before starting.
>
> The first attempt produced **smooth procedural blob fields** — large soft shapes
> from layered value noise, with no detail below about 32 pixels. Measured,
> adjacent pixels differed by **0.07–1.14** where a real surface scan differs by
> **5–18**, and the images retained **96–100 % of their contrast when downsampled
> to 32×32**, which is the mathematical signature of an image containing nothing
> but big blobs. They read as camouflage and lava lamps, not as metal.
>
> That was partly my fault: I over-stressed that fine detail averages away at
> sprite size, and you correctly concluded that fine detail was not worth drawing.
> **The correct requirement is both at once** — coarse structure that carries the
> read at sprite size, *with real grain layered on top of it.*
>
> **Generating these with code is not the problem and you should do it again.** It
> is how the first attempt got the seams mathematically perfect, which is the one
> hard part. The problem was the spectrum, and the fix is in the next section.
>
> ### The frequency stack — the central requirement
>
> Every tile must contain **three distinct scales of detail simultaneously**:
>
> 1. **Coarse** — features spanning roughly a fifth to a third of the tile. This
>    is what survives to sprite size and carries the faction's character.
> 2. **Mid** — features spanning roughly a fiftieth to a twentieth of the tile.
>    Panel-scale incident: chips, gouges, streaks, patch boundaries, blisters.
>    **This layer is what makes it read as a surface rather than a gradient, and it
>    was completely absent in round 1.**
> 3. **Fine** — pixel-to-few-pixel grain across the entire tile. Not a uniform
>    noise overlay dusted on top: grain that varies in strength with the coarse
>    layers, heavier in the damaged and corroded regions, lighter on intact paint.
>
> **Hard-edged features are required.** Chips, flakes, scratches and pits have
> *edges*. A threshold or an erosion against noise will give you those; a smooth
> gradient never will. Round 1 had no hard edges anywhere except where posterising
> banded a smooth field, which is a different and worse thing.
>
> **Explicitly banned**, because round 1 was made of them: metaball or smooth
> blob fields as the primary structure; gaussian blur as a texture source;
> posterised bands of flat value; anything that looks like camouflage, marble,
> lava lamp, bokeh or clouds.
>
> ### Hit these numbers — check before delivering
>
> Measured from the three maps currently in use, which are the standard:
>
> | | mean | SD | adjacent-pixel diff | contrast kept at 32px |
> | --- | --- | --- | --- | --- |
> | `plate_wear.png` | 88.0 | 42.6 | **7.05** | **90.5 %** |
> | `rust_mask.png` | 106.2 | 47.9 | **18.10** | **88.3 %** |
> | `plate_rough.png` | 72.0 | 12.6 | **2.13** | **86.2 %** |
>
> Targets for the new tiles:
>
> | Tile type | mean | SD | adjacent-pixel diff | kept at 32px |
> | --- | --- | --- | --- | --- |
> | `*_wear` | 80–115 | 38–52 | **5–11** | **86–92 %** |
> | `*_grime` | see §3 per faction | 40–58 | **10–20** | **85–92 %** |
> | `plate_rough_v2` | 126–130 | 11–16 | **2–4** | **84–90 %** |
>
> **Contrast retention above 94 % is a failure, not a success.** It means the
> image has no detail finer than 32 pixels. Retention *below* about 80 % means the
> opposite — the structure is too fine and will vanish at sprite size. Land inside
> the band.
>
> Run this on every tile and iterate until each one passes:
>
> ```python
> from PIL import Image
> import math
>
> def check(path):
>     g = Image.open(path).convert('L'); W, H = g.size; p = g.load()
>     px = list(g.get_flattened_data())
>     m  = sum(px) / len(px)
>     sd = lambda v: (sum((q - sum(v)/len(v))**2 for q in v) / len(v)) ** 0.5
>     adj = sum(abs(p[x, y] - p[x+1, y])
>               for y in range(0, H, 4) for x in range(W-1)) / ((W-1) * len(range(0, H, 4)))
>     lr  = sum(abs(p[0, y] - p[W-1, y]) for y in range(H)) / H
>     tb  = sum(abs(p[x, 0] - p[x, H-1]) for x in range(W)) / W
>     s512 = sd(list(g.resize((512, 512), Image.LANCZOS).get_flattened_data()))
>     s32  = sd(list(g.resize((32, 32),   Image.LANCZOS).get_flattened_data()))
>     print(f'{path}: mean {m:.1f}  SD {sd(px):.1f}  adj {adj:.2f}  '
>           f'seam {lr:.2f}/{tb:.2f}  kept32 {100*s32/s512:.1f}%')
>
> check('ironwake_wear.png')
> ```
>
> `adj` is the one that failed last time. **If `adj` is below 4 on a wear or grime
> tile, the tile has no grain and must be regenerated.** `seam` values should stay
> near or below `adj` — round 1 achieved this and it should be preserved.
>
> ### Everything else, unchanged from the first brief
>
> 1. **Seamless and tiling.** Opposite edges must match. **No vignette, no border,
>    no frame, no darkened corners, no drop shadow.** A vignette becomes a visible
>    grid the moment the texture repeats. Round 1 got this right — keep it.
> 2. **Greyscale only.** No colour, not even a tint. Colour comes from the game's
>    palette; these maps carry no hue by design.
> 3. **Flat and unlit.** No lighting, no cast shadows, no specular highlights, no
>    glow, no bevelling, no 3D relief rendering, no perspective. Any baked-in light
>    direction fights the game's own lighting and reads as a stain.
> 4. **No orientation and no readable content.** The tile lands on all six faces of
>    a part at arbitrary rotations and mirrorings. No text, no numbers, no logos,
>    no stencils, no arrows, no hazard chevrons, no insignia. Nothing with a
>    definite top or bottom.
> 5. **No repetition inside the tile.** No regular grid, no repeating motif. The
>    tile already repeats; an internal pattern multiplies into an obvious weave.
> 6. **The five wear tiles must be distinguishable from each other with the
>    filenames hidden.** Round 1 failed this — four of the five grime maps were the
>    same blur field at different densities. If two tiles differ only in contrast,
>    they are the same tile.
>
> ### Output format
>
> **1024×1024, square, PNG, 8-bit greyscale.** One image per tile, delivered as
> individual files. I downsample to 512² and normalise contrast myself.
>
> **Original work only.** Do not reproduce or approximate any existing game,
> franchise or manufacturer's design language, insignia or house style.

---

## 3. The eleven tiles

**Grime targets** are given as *percentage of pixels above a brightness
threshold*, because the shader gates each grime map at a faction-specific value
and discards everything below it. A map that misses this produces **no grime at
all**, silently.

### Concord Skyward — *maintained to a standard*

| File | Job | What it should show |
| --- | --- | --- |
| `concord_wear.png` | scuff / relief | **Restrained but not empty.** Large clean plate regions with crisp shallow panel structure. Wear concentrated into a few sparse patches — where hands and hardpoints go — against mostly untroubled paint. It still needs mid-scale incident and full grain; restrained means *localised*, not *smooth*. This is the least dramatic tile and that is correct. |
| `concord_grime.png` | grime gate | **Sparse film, not corrosion.** A small number of soft isolated deposits with grainy edges. Target: **1–2 % of pixels above 204.** |

### Ironwake Colliery — *industrial plant that was handed a gun*

| File | Job | What it should show |
| --- | --- | --- |
| `ironwake_wear.png` | scuff / relief | **The most damaged tile in the set.** Thick paint chipped down through visible layers, with **hard-edged chip boundaries**. Deep gouges and impact scarring running in random directions — rock damage, not blade damage. Heavy grain throughout. Highest `adj` of the five wear tiles. |
| `ironwake_grime.png` | grime gate | **Heavy and connected.** Broad regions of oxide and packed ore dust running together into large continuous areas, granular and crusty at the edges. Target: **30–40 % of pixels above 102.** |

### The Emberline Pact — *a machine with a paint history*

| File | Job | What it should show |
| --- | --- | --- |
| `emberline_wear.png` | scuff / relief | **Mismatched paint age.** Very large soft tonal regions — panel-sized areas at clearly different values, as though resprayed at different times in different mixes — **with hard boundaries where two respray areas meet**, and independent grain and scuffing within each region. The patchwork is the read; the grain proves it is paint. |
| `emberline_grime.png` | grime gate | **Corrosion painted over rather than cured.** Bright areas pushing up from underneath — blistered blooms with soft centres and granular broken edges where the paint has lifted. Target: **15–20 % of pixels above 133.** |

### Free Latitude — *no two are alike*

| File | Job | What it should show |
| --- | --- | --- |
| `latitude_wear.png` | scuff / relief | **Bare brushed alloy, barely painted.** Fine directional brushed-metal grain — the one tile where a *direction* is allowed, provided it is not a single global direction: several regions each brushed a different way, meeting at plate boundaries from different donor hulls. Round 1's Voronoi cell structure was the right idea; it needed grain inside the cells. White means "bare metal showing through here". |
| `latitude_grime.png` | grime gate | **Low corrosion.** Salvage crews run corrosion-resistant recovered stock. Small bright patches where dissimilar metals meet. Target: **3–5 % of pixels above 168.** |

### The Ashfall Irregulars — *costed for ninety seconds*

| File | Job | What it should show |
| --- | --- | --- |
| `ashfall_wear.png` | scuff / relief | **Cheap thin paint over unprepared metal.** Wide flaking and peeling in large sheets rather than small chips — paint that never adhered — with **ragged hard edges** where each sheet has lifted. Rough, uneven, careless. |
| `ashfall_grime.png` | grime gate | **Soot, not rust.** Soft sprayed deposition with feathered edges, heaviest in broad drifts as though blown across the surface. Fine even grain rather than crusty granularity — this is carbon, deposited, not grown. Target: **10–14 % of pixels above 148.** |

### Shared

| File | Job | What it should show |
| --- | --- | --- |
| `plate_rough_v2.png` | roughness offset | **Centred on mid-grey.** Broad soft variation in surface finish either side of 50 % grey, no overall bias. Much lower contrast than every other tile — it only breaks up a specular sweep. **Round 1's version passed** (mean 128.0, SD 13.0) and can be reused if regenerating it is not worth the effort; it needs only a little grain adding. **Optional** — see §6. |

---

## 4. What the engine actually does with each map

These are masks and their polarity is load-bearing; a map authored with the sense
inverted will look plausible and be wrong. Verified against the node graph in
`make_material()`, `tools/blender/build_mechs.py:800–955`.

| Map | Consumed as | Polarity |
| --- | --- | --- |
| `*_wear` | Scuff mask, **and** bump height | **White = worn, and white = raised.** |
| `*_grime` | Grime gate, **at two scales at once** | **White = grime.** Passed through a threshold ramp before use. |
| `plate_rough` | Signed roughness offset | **Mid-grey = no change.** Black smoother, white rougher. |

Three consequences that should change how you author:

* **The wear map is also the height map.** It is wired to a `Bump` node as well as
  the albedo mix, so its structure must be plausible as *relief*, not only as
  staining. A normal map cannot be used — the meshes carry no UVs, so there is no
  tangent basis — which is why relief comes from this map's luminance.

* **The grime map is sampled twice, at two scales.** Once very coarse
  (`TEX_SCALE_BROAD = 0.9`, about one repeat per part) for broad tonal drift, and
  once fine (`TEX_SCALE = 4.0`) through a threshold ramp. **Both its large-scale
  silhouette and its bright peaks matter.**

* **The gate discards everything below its threshold** — 0.40 for Ironwake up to
  0.80 for Concord. This is why §3 specifies coverage above a threshold rather
  than a target mean.

---

## 5. Round 1 — what came back, and why it was rejected

Eleven files, correct names, 1024², 8-bit `L`. **The seams were perfect** —
edge-wrap difference 0.04–1.52 against internal adjacent-pixel differences of the
same magnitude. Genuinely seamless, which was the predicted failure and did not
happen. ChatGPT achieved it by generating the tiles with code rather than with its
image model.

That same choice is why they were unusable:

| Measured | Delivered | Standard | |
| --- | --- | --- | --- |
| Adjacent-pixel difference | **0.07–1.14** | 2.13–18.10 | no grain at any scale |
| Contrast kept at 32×32 | **96–100 %** | 86–90 % | nothing finer than 32 px exists |

They read as camouflage, marble and bokeh. **And the faction distinction — the
whole reason for the commission — was largely absent**: four of the five grime
maps were the same blur field at different densities.

Two lessons, both now written into §2:

* **The brief caused it.** It said fine grain "averages away and is wasted effort"
  and "if it would not survive being resized to 32×32, do not draw it". That is a
  correct statement about what *survives* and a disastrous instruction about what
  to *draw*. The requirement is coarse structure **and** grain.
* **A single acceptance number would have caught it before delivery.** `adj` below
  4 is dispositive and takes one line to compute. The self-check script is in the
  prompt now so the model can reject its own output before it reaches us.

Worth keeping from round 1: `plate_rough_v2.png` passes its (narrow) job, and
`latitude_wear.png`'s Voronoi donor-panel structure was the right idea executed
without grain.

---

## 6. Two things this sheet cannot fix on its own

Both are code changes, deliberately **not** bundled with this commission.

* **Free Latitude scuffs *bright*, and the shader can only scuff dark.** Every
  wear map mixes toward `_scale_rgb(rgb, WEAR_DARK)` — a darker identity hue. Bare
  alloy through paint is *lighter*. Free Latitude's wear mix needs
  `toward=(1, 1, 1)`, the way the edge highlight already does. **Author
  `latitude_wear.png` as if white means "bare metal here"** and the wiring will
  catch up.

* **`plate_rough.png` is biased, and replacing it is a separate decision.** It is
  a *signed* offset around mid-grey but its mean is 72/255 ≈ 0.28, biasing every
  surface about 0.20 smoother than its authored roughness. The current tuning may
  rest on that bias. `plate_rough_v2.png` is therefore optional and must not
  overwrite the existing file — swapping in a centred map changes every material
  on all eight machines at once, which is a change to measure on its own.

---

## 7. Accepting the set

1. **Run the check script on all eleven.** `adj` below 4 on a wear or grime tile
   is an automatic reject. Contrast retention above 94 % is an automatic reject.
   **SD 0 is a dead map** — it costs nothing, raises no error, and invites the
   false conclusion that the texture did not help.
2. **Tile each one 3×3 and look for a grid.** Visible seams or darker corners:
   reject.
3. **Downsample to 32×32 and look again.** The faction's character should still be
   recognisable. If it has become uniform grey, the structure was too fine.
4. **Hide the filenames and lay the five wear tiles side by side.** Can you assign
   each to its faction? This is the test round 1 failed, and it is the one that
   decides whether the commission was worth making.
5. **Squint for baked lighting.** A light direction will fight the scene key.
6. **Check for text and symbols.** Box projection will mirror them.

---

## 8. What happens to the files afterwards

Delivered PNGs go to **`assets/blender/textures/`** — *not* `assets/sprites/mechs/`,
which is rendered sprite output. Processed the same way the Poly Haven set was:
downsample to 512², autocontrast, convert to 8-bit L, verify SD.

**The 16-bit trap applies to anything delivered at higher bit depth.** A mode
`I;16` PNG through `Image.convert('L')` **clamps rather than scales**, so
everything above 255 goes white and the map comes out flat — mean 255.0, SD 0.0.
Scale explicitly:

```python
if im.mode in ('I;16', 'I'):
    im = im.point(lambda v: v * (255.0 / 65535.0)).convert('L')
```

Wiring is a small change to `_load_image` / `make_material` so filenames become
faction-dependent rather than module constants. `FACTIONS` and `FACTION_SURFACE`
already exist at `build_mechs.py:641–691` and already map each chassis to its
power, so the lookup is in place — only the filenames are hardcoded.

Then rebuild the sprites and **look at them**. A texture change is a visual change,
and the standing rule on this project is that measuring that a thing exists is not
the same as confirming it can be seen.
