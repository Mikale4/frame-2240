# Mech design sheets

Commissioned design mockups for the eight chassis — the modelling references that
`tools/blender/build_mechs.py` is built against.

Briefed by `docs/PROMPT_MECH_DESIGN.md`, with `docs/MECH_ROSTER_CONTEXT.md`
attached as the lore and palette authority.

## Naming

One sheet per machine, each carrying three views (front ortho, side ortho, and
three-quarter at azimuth 15° / elevation 9°) plus an exploded part inset:

```
halcyon_design_v1.png
nocturne_design_v1.png
vesper_design_v1.png
terramoth_design_v1.png
cirrus_design_v1.png
obelisk_design_v1.png
pyre_design_v1.png
nulltide_design_v1.png
```

Bump the version rather than overwriting — `halcyon_design_v2.png` — so a design
that was rejected stays readable next to the one that replaced it. The
`_vN` suffix is what tells you which sheet the current geometry was built from.

## Why here and not `docs/reference/`

`docs/reference/` holds captures from **Babel Sword 2005**. That material is
study-only and its provenance matters. These sheets are original work commissioned
for this project, and they are a Blender production input rather than something to
read, so they live beside the `.blend` and the surface textures they inform.

## These are tracked

Same reasoning as `assets/audio/`: **they are not reproducible.** Re-running the
prompt gives different machines, so the sheet a chassis was modelled from is the
only record of the intended design. Commit them at full resolution.

Nothing here ships — the game loads `assets/sprites/mechs/`, never this directory.
