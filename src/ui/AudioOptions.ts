import type { MenuItem } from './Menu';
import { session } from '../core/Session';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';
import {
  VOLUME_STEPS,
  clampStep,
  saveAudioSettings,
  stepLabel,
  stepToGain,
} from '../audio/AudioSettings';

/**
 * The two volume rows, shared by the main menu and the pause overlay.
 *
 * Shared rather than written twice because they are the same control: someone
 * who turns the music down mid-match expects it to still be down at the title,
 * and two copies of this drift apart the first time one of them gains a feature.
 *
 * There is no separate mute. Either slider at zero *is* the mute for that bus,
 * which is finer-grained than the single ON/MUTED toggle this replaced — the
 * common case is wanting the music gone and the hit confirmation kept.
 */
export function audioMenuItems(): MenuItem[] {
  const bump = (bus: 'music' | 'sfx', dir: number): void => {
    session.audio[bus] = clampStep(session.audio[bus] + dir);
    applyAudioSettings();
    saveAudioSettings(session.audio);
  };
  return [
    {
      label: 'MUSIC',
      value: () => stepLabel(session.audio.music),
      // Confirm cycles rather than doing nothing, so the row is still usable
      // from a gamepad d-pad that a scene has only wired up and down.
      onSelect: () => bump('music', session.audio.music >= VOLUME_STEPS ? -VOLUME_STEPS : 1),
      onAdjust: (dir) => bump('music', dir),
    },
    {
      label: 'SFX',
      value: () => stepLabel(session.audio.sfx),
      onSelect: () => bump('sfx', session.audio.sfx >= VOLUME_STEPS ? -VOLUME_STEPS : 1),
      onAdjust: (dir) => bump('sfx', dir),
    },
  ];
}

/** Pushes the session's levels at both buses. Safe before either has a context. */
export function applyAudioSettings(): void {
  sfx.setGain(stepToGain(session.audio.sfx));
  music.setGain(stepToGain(session.audio.music));
}
