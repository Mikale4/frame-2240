"""
Rebuilds only the eight supporter drones, in place, in an already-built mechs.blend.

WHY A SEPARATE ENTRY POINT
--------------------------
`build_mechs.build_all` re-renders the whole roster: 8 chassis x 14 parts, ~112
renders, plus 8 assembled previews. Changing one drone design does not justify
that, and re-rendering art that was already correct is a good way to introduce a
regression that has nothing to do with the change.

This rebuilds the `<mech>_drone` object for each chassis, re-renders that one
sprite, patches its row in `manifest.json`, and leaves every other part alone.

RUN IT SYNCHRONOUSLY
--------------------
`bpy` is not thread-safe — running a build on a background thread to dodge an MCP
timeout crashes Blender. The timeout is only the request window closing; the work
continues on Blender's main thread regardless. This writes progress to
`renders/debug/_drone_build_status.json` so the caller can poll instead.

Afterwards you MUST run `python tools/pack_atlases.py`, or the game keeps drawing
the old atlas and none of this is visible.
"""

import json
import os
import sys
import traceback

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _status_path(root):
    return os.path.join(root, "renders", "debug", "_drone_build_status.json")


def rebuild(root=ROOT, preview=True):
    tools = os.path.join(root, "tools", "blender")
    if tools not in sys.path:
        sys.path.insert(0, tools)
    import importlib

    import build_mechs

    importlib.reload(build_mechs)
    bm = build_mechs

    status = _status_path(root)
    os.makedirs(os.path.dirname(status), exist_ok=True)

    def note(**kw):
        with open(status, "w", encoding="utf-8") as fh:
            json.dump(kw, fh)

    note(state="start")
    try:
        # The portrait pass leaves BSR_PortraitCam active; these three are
        # idempotent and put the scene back into sprite-rendering condition.
        bm.setup_world_and_lights()
        bm.setup_outlines()
        cam = bm.setup_camera()

        sprites = os.path.join(root, "assets", "sprites", "mechs")
        debug = os.path.join(root, "renders", "debug")
        os.makedirs(debug, exist_ok=True)
        mpath = os.path.join(sprites, "manifest.json")
        with open(mpath, encoding="utf-8") as fh:
            meta = json.load(fh)
        manifest = meta["parts"]

        order = list(bm.CHASSIS)
        scene = bpy.context.scene
        # Keyed by NAME, never by object reference: this loop deletes the old
        # drone objects, and a Python handle to a removed Object raises
        # ReferenceError the moment anything touches it — including the restore
        # in the `finally` below, which is where it bit the first time.
        saved_hide = {o.name: o.hide_render for o in bpy.data.objects if o.type == "MESH"}
        saved_ortho = cam.data.ortho_scale
        tiles = {}

        try:
            for o in bpy.data.objects:
                if o.type == "MESH":
                    o.hide_render = True

            for i, mech_id in enumerate(order):
                old = bpy.data.objects.get(f"{mech_id}_drone")
                if old is not None:
                    bpy.data.objects.remove(old, do_unlink=True)

                obj = bm.build_drone(mech_id)
                obj.hide_render = True
                tiles[mech_id] = bm.render_one_part(obj, sprites, mech_id, "drone", manifest)

                if preview:
                    # A larger solo render, purely so the result can be eyeballed
                    # without launching the game.
                    saved_loc = tuple(obj.location)
                    obj.location = (0.0, 0.0, 0.0)
                    obj.hide_render = False
                    scene.render.resolution_x = 320
                    scene.render.resolution_y = 320
                    cam.data.ortho_scale = 1.35
                    scene.render.filepath = os.path.join(debug, f"{mech_id}_drone_preview.png")
                    bpy.ops.render.render(write_still=True)
                    obj.hide_render = True
                    obj.location = saved_loc

                # Match build_all's layout, so the saved .blend still shows the
                # roster side by side rather than eight machines in one spot.
                obj.location.x += 4.0 * i
                note(state="working", done=i + 1, total=len(order), mech=mech_id)
        finally:
            cam.data.ortho_scale = saved_ortho
            scene.render.resolution_x = bm.TILE
            scene.render.resolution_y = bm.TILE
            for o in bpy.data.objects:
                if o.type == "MESH":
                    o.hide_render = saved_hide.get(o.name, False)

        with open(mpath, "w", encoding="utf-8") as fh:
            json.dump(meta, fh, indent=2)
        bpy.ops.wm.save_as_mainfile(
            filepath=os.path.join(root, "assets", "blender", "mechs.blend")
        )
        note(state="done", tiles=tiles)
        return tiles
    except Exception:
        note(state="error", err=traceback.format_exc())
        raise


if __name__ == "__main__":
    rebuild()
