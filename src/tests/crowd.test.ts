import { describe, expect, it } from 'vitest';
import { BARKS, CrowdSim, barkFor } from '../campaign/Crowd';
import { REGIONS, buildReachWalk, doorOf } from '../campaign/Regions';

describe('the people of the Reach', () => {
  const walk = buildReachWalk();

  it('every yard but Cathedral Yard has people, and Cathedral Yard has none', () => {
    const sim = new CrowdSim(walk, 7);
    for (const r of REGIONS) {
      const n = sim.agents.filter((a) => a.region === r.id).length;
      if (r.id === 'cathedral') expect(n).toBe(0);
      else expect(n, r.id).toBeGreaterThan(0);
    }
  });

  it('a long day leaves everyone on walkable deck, and most people move', () => {
    const sim = new CrowdSim(walk, 11);
    const start = sim.agents.map((a) => ({ x: a.x, z: a.z }));
    for (const r of REGIONS) {
      for (let i = 0; i < 60 * 90; i++) sim.step(1 / 60, { x: r.cx, z: r.cz }, 60);
    }
    for (const a of sim.agents) expect(walk.standAt(a.x, a.z, a.y, 0.3), a.id).not.toBeNull();
    const moved = sim.agents.filter((a, i) => Math.hypot(a.x - start[i].x, a.z - start[i].z) > 2).length;
    expect(moved / sim.agents.length).toBeGreaterThan(0.5);
  }, 60_000);

  it('everyone has something to say, and nobody says the forbidden thing', () => {
    const sim = new CrowdSim(walk, 3);
    for (const a of sim.agents) {
      const r = REGIONS.find((q) => q.id === a.region)!;
      expect(barkFor(r.style, a.role, a.seed).length, a.id).toBeGreaterThan(0);
    }
    const all = Object.values(BARKS).flatMap((by) => Object.values(by).flat());
    for (const line of all) {
      expect(line).not.toMatch(/2240|2,240|Stillwake/);
      expect(line).not.toMatch(/!/);
      expect(line.length).toBeLessThan(150);
    }
  });

  it('every door can be stood at', () => {
    for (const r of REGIONS) {
      for (const b of r.buildings) {
        const d = doorOf(b);
        // A building on a raised platform opens onto the platform.
        const floor = walk.ground(r.cx + d.sx, r.cz + d.sz, r.y + 20) ?? r.y;
        expect(walk.standAt(r.cx + d.sx, r.cz + d.sz, floor, 0.3), `${r.id} door`).not.toBeNull();
      }
    }
  });
});
