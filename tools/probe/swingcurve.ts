/**
 * Prints PYRE's composed reap curves.
 *
 * The swing is five terms now — arm angle, weapon rotation within the grip,
 * chassis lean, reach along the aim and lift across it — and reading them
 * together is the only way to see whether they actually describe a scythe stroke
 * rather than five separate wobbles.
 *
 *   npx vite-node tools/probe/swingcurve.ts
 */
import {
  swingArcAngle,
  swingWeaponSpin,
  swingLean,
  swingLift,
  swingReach,
  swingGrip,
} from '../../src/combat/Combatant';
import { PYRE } from '../../src/data/rosterExtra';

const arc = PYRE.meleeLock.arc;
const D = 180 / Math.PI;
console.log('\n  PYRE reap —', JSON.stringify(arc), '\n');
console.log('     t    arm°  weapon°   lean°   reach    lift   grip');
for (let i = 0; i <= 12; i++) {
  const t = i / 12;
  console.log(
    t.toFixed(2).padStart(6),
    (swingArcAngle(arc, t, 0) * D).toFixed(1).padStart(7),
    (swingWeaponSpin(arc, t, 0) * D).toFixed(1).padStart(8),
    (swingLean(arc, t, 0) * D).toFixed(1).padStart(7),
    swingReach(arc, t, 0).toFixed(1).padStart(7),
    swingLift(arc, t, 0).toFixed(1).padStart(7),
    swingGrip(arc, t).toFixed(2).padStart(6),
  );
}
console.log('');
