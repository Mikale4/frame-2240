# Babel Sword: Reignition — New Session Handoff

> Prepared from the exported Claude session dated July 30, 2026.
>
> This is a continuity document, not a replacement for the repository. The new session must inspect the actual files, Git history, tests, and project-level `CLAUDE.md` before editing anything.

## Instructions to the new Claude session

1. Open and follow the project-level `CLAUDE.md` before doing anything else.
2. Work inside:
   - Workspace: `C:\Games\Babel Sword Claude`
   - Project: `C:\Games\Babel Sword Claude\Babel Sword Reignition`
3. Treat the original Babel Sword folders, screenshots, MUGEN/Ikemen files, and Iron Babel builds as **read-only research references**.
5. Inspect the repository instead of trusting this handoff blindly:
   - `git status`
   - `git log --oneline -10`
   - `npm test` or `npx vitest run`
   - `npx tsc --noEmit`
   - `npm run build`
6. Read the existing project documents:
   - `docs/REFERENCE_AUDIT.md`
   - `docs/IMPLEMENTATION_PLAN.md`
   - `docs/DECISIONS.md`
   - `README.md`
7. Continue from the current code. Do not recreate the project, replace the stack, or redo completed systems.

---

## Current user goal

Build **Babel Sword: Reignition** as an original, playable game inspired by the systems and presentation principles of Babel Sword 2005 and Iron Babel.

The user's current priorities are:

1. Make the melee system function like the Iron Babel build.
2. Use a real modeled beam saber with beam bloom—not a VFX-only lance.
3. Keep the current movement tuning; the user said movement now feels fine.
4. Build the **Babel Sword 2005-style tiny helper/supporter mech** and make the assist/sub-attack input command that helper to attack.

Items 1–3 were completed in the old session. **Item 4 is the immediate next task and has not been started.**

---

## Verified end state of the old session

At the final reported checkpoint:

- Git working tree was reported clean at commit **`2160782`**.
- **135 tests passed.**
- TypeScript typecheck passed.
- Production build passed.
- Blender export produced **22 mech-part sprites**, including both modeled sabers.
- The final browser-based visual check could not be completed because Claude's browser pane refused navigation even though the server returned HTTP 200.

Do not assume those facts are still current. Re-run the checks at the start of the new session.

### Most important visual caveat

The new saber rendered correctly in Blender, but its **in-game position on the arm was not visually verified**. The first live task should include a hard reload and a real in-game check of:

- Saber attachment/pivot
- Hilt orientation
- Blade direction and length
- Rifle stowing during melee
- Bloom alignment over the physical blade
- HALCYON six-hit chain and NOCTURNE three-hit chain

Adjust only after observing the current build.

---

## Current implementation overview

### Technology

- TypeScript
- Phaser 3
- Vite
- Vitest
- Blender Python/MCP art pipeline
- Deterministic simulation core kept separate from Phaser presentation code

### Project structure

Important areas include:

- `src/core/` — configuration, math, RNG, session state
- `src/combat/` — attack data, command/input buffer, flight, combatant, match simulation
- `src/projectiles/`
- `src/mechs/`
- `src/data/mechs.ts` — centralized chassis/flight/combat tuning
- `src/ai/RivalAI.ts`
- `src/input/` — remappable bindings and physical-key tracking
- `src/render/` — mech rig, effects, backdrops
- `src/ui/` — HUD, menus, controls panel
- `src/scenes/` — Boot, Title, Battle, Results
- `src/tests/`
- `tools/blender/build_mechs.py`
- `tools/blender/build_arena.py`
- `public/assets/` or the current generated-art destination—verify from the repository

### Implemented gameplay systems

- Title, battle, pause, results, rematch, and return-to-title flow
- Deterministic match simulation
- Momentum flight, air brake, boost/dash, and grounded/flight-mode behavior
- Soft lock and manual aim
- Main, heavy, sub, and motion-command attacks
- Barrier/guard, absorption, guard break, and hitstun cancellation cost
- Three Saturation modes
- Five-gauge HUD
- CPU opponent with eight skill levels using the same input interface as the player
- Training dummy that remains passive and respawns instead of ending the session
- Y-position depth scaling based on the 2005 pseudo-3D presentation
- Ground plane, landing/takeoff, and FlightMode toggle
- Layered defense multipliers
- Fully remappable controls saved to `localStorage`
- Keyboard/gamepad resilience and debug overlays

---

## Current controls

Defaults reported at the end of the old session:

- Movement: WASD or arrow keys
- Main gun: `J`
- Heavy shot: `K`
- Sub/assist action: `L`
- Melee: `U`
- Boost/dash/air brake: `Shift` or `Space`
- Barrier/guard: `F`
- Flight mode toggle: `C`

Controls can be changed from **CONTROLS** on the title screen. The remapping system stores physical `KeyboardEvent.code` values, supports keyboard and pad slots, prevents double-binding by stealing a key from its previous action, and persists to `localStorage`.

For the next task, the user wants the sub/assist action to come from a tiny helper mech as in Babel Sword 2005. Inspect the current `sub` action path and reference behavior before deciding whether to replace the player's direct sub-shot completely or route it through the supporter. The user's stated intent is that the attack visibly originates from and is performed by the helper.

---

## Melee system at the end of the session

The earlier manually re-pressed rekka chain was replaced with an Iron Babel-style **committed lock-on sequence**.

### Expected design

- One button press acquires a live target within acquire range.
- The move runs through `close → swing → gap → swing … → end`.
- It consumes energy to open and per swing.
- It repositions around the target between hits with a side offset/wobble instead of only bulldozing straight through.
- Damage and knockback escalate, with the largest finisher at the end.
- The finisher separates the fighters back toward neutral.
- The sequence drops when the attacker is hit, the target dies, energy is insufficient, or timeout occurs.
- The move announces its name when opened.

### Per-chassis behavior

- **HALCYON:** fast six-hit saber chain, tighter tracking, cheaper swings
- **NOCTURNE:** heavy three-hit siege-claw chain, slower and harder-hitting

### Important regression fix

Being hit originally failed to cancel melee lock because the hitstun branch returned before the melee state stepped. This was fixed and tested. Preserve that behavior.

---

## Beam saber implementation

The VFX-only lance was replaced with a physical Blender-generated `meleeWeapon` part.

Expected geometry and rendering:

- Ribbed hilt and pommel
- Flared emitter shroud with prongs
- Three concentric tapering blade layers
- White-hot core
- Saturated inner sheath
- Soft outer bloom
- Rifle stows while the saber is active
- Additive sprite serves as bloom over the physical blade rather than being the blade itself

The final in-game attachment still needs visual verification.

---

## Art direction and user feedback

The user repeatedly rejected generic upright, rounded, blocky, or clunky robot designs. The intended visual language is based on the actual Babel Sword reference art:

- Hunched, forward-pitched, low-slung bodies
- Reverse-joint/digitigrade legs and splayed feet
- Tiny cockpit/head area
- Oversized weapon dominating the silhouette
- Large shoulder/backpack masses
- Wide horizontal composition
- Sharp tapered wedges and angled slabs
- Thin overlapping armor shells, visible lips, seams, recesses, and deliberate greebles
- Dark contours and readable silhouettes at roughly 100-pixel gameplay size
- Avoid building major forms from plain cubes and cylinders

The current procedural models were improved substantially but the old session acknowledged a structural ceiling: hand-authored reference-quality modeling would require per-mech silhouette work rather than continued parameter tuning. The user chose **Option 3: prioritize missing gameplay systems for now**, not a full hand-modeling rewrite.

Do not restart another broad art overhaul unless the user requests it. The helper drone should nevertheless respect the sharper, tapered design language.

---

## Current mech identities

### HALCYON

- Slim interceptor identity
- Scoped/drum-fed rifle
- Twin thruster bells
- Beam saber/beam edge
- Fast six-hit lock-on melee

### NOCTURNE

- Broad assault-frame identity
- Six-barrel rotary cannon with belt feed
- Caged burner/exhaust stacks
- 12-cell missile rack
- Breaching-claw melee identity
- Heavy three-hit lock-on melee

They are not intended to be simple recolors. The Blender builder uses per-chassis specifications for proportions, legs, weapon, booster, pod, and melee hardpoint. Verify the current manifest/pivot contract before editing rigs.

---

## Immediate next milestone: supporter/assist drone

The user explicitly wants the 2005-style tiny helper mech that assists with attacks through the assist/sub button.

The old session identified reference evidence in the 2005 documentation: `howto-en.html` lists HUD element 2 as **“supporter — sub shoot.”** Re-open and study the relevant 2005 files rather than relying on this one phrase.

### Required work

1. **Reference audit**
   - Find the supporter/helper's states, helper IDs, animations, triggers, positioning, cooldown/resource rules, projectile ownership, and destruction/respawn behavior in Babel Sword 2005.
   - Record evidence and conclusions in `docs/REFERENCE_AUDIT.md`.
   - Do not copy reference assets or code.

2. **Simulation entity**
   - Add a deterministic supporter entity/state to the simulation.
   - Follow the owning mech with smooth but responsive movement.
   - Decide and document whether it is targetable, invulnerable, persistent, disabled during KO, and how it behaves across scene/match resets—based on reference evidence.
   - The attack must originate from the drone, not invisibly from the player chassis.
   - Use the existing input interface rather than creating a separate untested input path.

3. **Assist action**
   - Route the current sub/assist input through the supporter according to the reference design and user intent.
   - Preserve remapping, keyboard/gamepad support, edge semantics, pause behavior, training mode, and deterministic replays/tests.
   - Define energy/meter cost and cooldown from evidence or clearly documented original tuning.

4. **Rendering and art**
   - Build an original tiny helper model in Blender.
   - Use the sharp, tapered Babel Sword-inspired visual language; avoid a generic sphere/cube drone.
   - Export through the existing manifest/pivot pipeline.
   - Render the drone behind/in front of the owner correctly based on depth and Y-scaling.
   - Add muzzle flash/projectile origin/effects at the helper's weapon point.

5. **HUD and feedback**
   - Add a readable supporter/assist status indicator only if the reference or gameplay requires one.
   - Show cooldown/ready state without cluttering the existing five-gauge HUD.
   - Add clear sound and visual confirmation when the assist is unavailable.

6. **Tests**
   - Deterministic follow behavior
   - Attack originates from supporter coordinates
   - Correct owner/team and target behavior
   - Cooldown and resource checks
   - No action during intro, pause, KO, or invalid states
   - Match/rematch/reset lifecycle does not leave destroyed sprites or stale supporter state
   - Training dummy behavior remains passive
   - Input completeness test includes the assist action
   - Long-run NaN and determinism checks still pass

7. **Live verification**
   - Hard reload with `Ctrl+Shift+R` to avoid stale Vite modules.
   - Verify through the real `InputManager`, not by injecting `InputFrame` directly.
   - Test title → battle → assist → KO/results → rematch → assist again.
   - Confirm gamepad disconnect handling still works.

### Definition of done

The task is not complete until:

- The helper is visible and follows the player.
- Pressing the remappable assist/sub input visibly makes the helper perform the attack.
- The projectile/effect begins at the helper's weapon point.
- The action obeys costs/cooldowns and all match states.
- Tests, typecheck, and production build pass.
- The full rematch lifecycle is verified.
- Documentation is updated.
- The result is committed cleanly.

---

## Remaining known gaps after the supporter

The previous 2005 gap audit identified additional incomplete or deferred systems. Re-check the docs because some may have changed:

- Pilot portraits and stock/life icons
- Mission win conditions such as escort or waves
- Boss-specific AI roles
- Additional chassis/roster content
- More arenas and stronger audio identity
- Off-screen indicators at extreme separation
- Potential hand-authored model trial if art becomes the priority again

Y-depth scaling, ground/FlightMode, and layered defense were subsequently implemented, so do not treat older gap lists as current without checking the code.

---

## Important prior bugs and lessons

These failures were already found once. Avoid reintroducing them:

- Rematch reused an array containing destroyed projectile sprites; scene-owned arrays must be reset on `create()`/shutdown.
- Menu/UI objects could be accessed after scene shutdown; observe scene lifecycle explicitly.
- HUD objects scaled with the gameplay camera until a dedicated UI camera was used.
- `InputManager` once omitted the new melee action even though bindings and simulation supported it. Keep action mappings table-driven and completeness-tested.
- Direct `InputFrame` injection hid a real input-path bug. Verify through actual keyboard/gamepad handling.
- Vite stale modules caused misleading tests. Hard reload before concluding the source is wrong.
- Debug reads can consume pressed-edge state before the scene receives it.
- `pushApart` once moved grounded mechs through the floor; reapply world constraints after collision resolution.
- Ground walk-speed capping once suppressed melee lunge.
- Melee used stale aim and lunged away from the locked target; lock-on commitment must use target direction.
- Being hit once failed to cancel the lock-on sequence because of early return ordering.
- Blender object-name collisions silently skipped NOCTURNE exports; names are namespaced and missing parts should fail loudly.
- Browser automation/harness failures are not proof the game is broken; distinguish tool limitations from application behavior, but do not skip a real visual test when the user can run it.

---

## Commands to run

From `C:\Games\Babel Sword Claude\Babel Sword Reignition`:

```bash
npm install
npx tsc --noEmit
npx vitest run
npm run build
npm run dev
```

The project also includes:

```text
run-game.bat
build-game.bat
```

Previously used local URLs:

- Development: `http://localhost:5173/`
- Production preview: `http://localhost:4173/`

A new session should not assume either server is still running.

---

## Useful Git checkpoints reported by the old session

Verify with `git log`; these are continuity hints, not guaranteed branch state:

- `7f5fdb4` — early corrected models/melee-range checkpoint
- `6491585` — remappable controls and additional art refinement
- `daef569` — deeper 2005 audit checkpoint
- `a9a5484` — wedge-based procedural art pass
- `abd8b6b` — movement responsiveness, real melee input path, training dummy, Iron Babel-informed fixes
- `2160782` — Iron Babel-style lock-on melee and modeled beam saber; final old-session checkpoint

Do not reset to an older hash unless recovery is actually needed.

---

## Recommended opening message for the new session

Paste this after placing this file in the project root:

```text
Open and follow the project-level CLAUDE.md first. Then read
BABEL_SWORD_NEW_SESSION_HANDOFF.md, docs/REFERENCE_AUDIT.md,
docs/IMPLEMENTATION_PLAN.md, docs/DECISIONS.md, and README.md.

Inspect git status and recent commits, run the full test suite, typecheck, and
production build, then launch the current game and visually verify the new
beam saber's in-game attachment and both lock-on melee profiles. Do not redo
completed work and do not modify or copy assets from the read-only Babel Sword
or Iron Babel reference folders.

After verifying the baseline, implement the Babel Sword 2005-style tiny
supporter/assist mech described in the handoff. The remappable sub/assist input
must visibly command the helper to attack, with the attack originating from
that helper. Study the 2005 reference states and documentation first, keep the
simulation deterministic, use the existing Blender export/pivot pipeline,
add lifecycle and input-path regression tests, verify rematch behavior, update
the docs, and commit the completed work.
```

---

## Final instruction

Be candid about what was visually verified versus what is only covered by tests. Preserve working systems, make focused changes, and finish the supporter end-to-end rather than starting several unrelated features.
