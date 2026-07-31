"""
Trims and normalises the generated sound effect set, in place.

WHY
---
The 71 files came out of ElevenLabs raw. Two problems, both measured rather than
guessed (run with --report to see the numbers):

1. **Level is all over the place.** Mean volume spanned 28 dB across the set,
   from -4.8 dBFS to -33.4. Thirteen files peaked below -4 dBFS, so cues like
   `ui_confirm` and `hit_light_4` were effectively inaudible next to the rest.
   `SoundBank.ts` carries a per-cue `gain`, but every value there is <= 1: it can
   quieten a loud cue and can do nothing for a quiet one.
2. **Dead air.** The generator has a 0.5 s minimum, so short cues arrived padded.
   The two voice lines also carry leading silence — 287 ms in front of "ENGAGE!",
   which is a quarter of a second of latency on a callout that fires the instant
   control unlocks.

WHAT IT DOES
------------
* **RMS-normalise to a target mean, limited by a peak ceiling.** Perceived
  loudness follows mean level, not peak, so peak-only normalisation leaves a
  sparse transient sounding quiet next to a dense one. The gain applied is
  whichever of the two constraints binds first, so nothing ever clips.
* **Strips leading silence**, which is pure latency.
* **Strips trailing silence**, leaving a short tail and fading into it so the cut
  cannot click.
* **Leaves the two loop beds untrimmed.** They are seamless; cutting either end
  puts a hole in the loop. They are normalised like everything else, and their
  much lower playback level stays where it belongs, in `SoundBank.ts`.

WHAT IT DELIBERATELY DOES NOT DO
--------------------------------
`docs/AUDIO_CUE_SHEET.md` lists a target duration per cue, several far shorter
than what was generated (`fire_vulcan` wants 0.10 s; the file carries audio
across its full 0.52 s). Those targets were written before the audio existed.
Cutting real content down to them is a judgement that has to be made by ear, not
by a script, so this only removes silence.

The originals are committed, so `git checkout assets/audio` undoes everything
here. Run with `--report` first if you want the numbers without touching a file.
"""

import argparse
import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile

AUDIO_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'audio')

# Target mean (RMS) level. Chosen from the set's own median (-16.1 dBFS) so the
# bulk of the library moves as little as possible and only the outliers travel.
TARGET_MEAN_DB = -16.0
# Nothing may peak above this. Two reasons for the headroom: the mixer sums
# several cues at once constantly in a firefight, and an mp3 round-trip does not
# preserve peaks — encoding at -1.0 measured back at -0.0 on the densest file,
# so the ceiling has to absorb the codec's overshoot as well.
PEAK_CEILING_DB = -1.6
# Never move a file by more than this, in either direction. A cue that needs
# +25 dB is not quiet, it is broken, and silently amplifying its noise floor
# would hide that.
MAX_GAIN_DB = 18.0

SILENCE_FLOOR_DB = -45
# Tail left after the last audible moment, and the fade run into it.
TAIL_PAD = 0.04
FADE = 0.025

# Seamless beds: trimming either end puts a hole in the loop.
NO_TRIM = {'thruster_loop.mp3', 'drone_hover.mp3'}


def probe(path):
    """Duration, peak, mean, and where audible content starts and stops."""
    p = subprocess.run(
        ['ffmpeg', '-i', path, '-af',
         f'volumedetect,silencedetect=noise={SILENCE_FLOOR_DB}dB:d=0.015', '-f', 'null', '-'],
        capture_output=True, text=True, errors='replace',
    )
    e = p.stderr
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', e)
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0
    mx = re.search(r'max_volume: (-?[\d.]+) dB', e)
    mn = re.search(r'mean_volume: (-?[\d.]+) dB', e)
    sil_start = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', e)]
    sil_end = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', e)]

    # Leading silence only counts if the file opens with it.
    lead = sil_end[0] if (sil_start and sil_start[0] < 0.03 and sil_end) else 0.0
    # Trailing silence only counts if the file ends inside one.
    end = sil_start[-1] if sil_start and (not sil_end or sil_start[-1] > sil_end[-1]) else dur
    return dict(dur=dur,
                peak=float(mx.group(1)) if mx else 0.0,
                mean=float(mn.group(1)) if mn else 0.0,
                lead=lead, end=min(end, dur))


def plan(name, s):
    """Gain in dB, plus the trim window. Returns None when nothing is worth doing."""
    by_mean = TARGET_MEAN_DB - s['mean']
    by_peak = PEAK_CEILING_DB - s['peak']
    gain = max(-MAX_GAIN_DB, min(MAX_GAIN_DB, min(by_mean, by_peak)))

    if name in NO_TRIM:
        start, end = 0.0, s['dur']
    else:
        start = s['lead'] if s['lead'] > 0.02 else 0.0
        end = min(s['dur'], s['end'] + TAIL_PAD) if s['dur'] - s['end'] > 0.05 else s['dur']
    if end - start < 0.05:
        return None
    return dict(gain=gain, start=start, end=end)


def apply(path, p, dest):
    length = p['end'] - p['start']
    chain = [f"atrim=start={p['start']:.4f}:end={p['end']:.4f}", 'asetpts=N/SR/TB']
    if abs(p['gain']) > 0.05:
        chain.append(f"volume={p['gain']:.2f}dB")
    fade_at = max(0.0, length - FADE)
    chain.append(f'afade=t=out:st={fade_at:.4f}:d={FADE}')
    cmd = ['ffmpeg', '-y', '-i', path, '-af', ','.join(chain),
           '-codec:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', dest]
    r = subprocess.run(cmd, capture_output=True, text=True, errors='replace')
    if r.returncode != 0 or not os.path.exists(dest) or os.path.getsize(dest) == 0:
        raise RuntimeError(f'ffmpeg failed on {path}:\n{r.stderr[-800:]}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--report', action='store_true', help='measure only, change nothing')
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(AUDIO_DIR, '*.mp3')))
    if not files:
        print(f'no audio in {AUDIO_DIR}', file=sys.stderr)
        return 1

    tmp = tempfile.mkdtemp(prefix='bsr_audio_')
    changed = 0
    try:
        print(f"{'file':28s} {'gain':>7s} {'trim':>16s}")
        for f in files:
            name = os.path.basename(f)
            s = probe(f)
            p = plan(name, s)
            if p is None:
                print(f'{name:28s}       -   (skipped)')
                continue
            cut = f"{s['dur']:.2f}->{p['end'] - p['start']:.2f}s"
            print(f"{name:28s} {p['gain']:+6.1f}dB {cut:>16s}")
            if args.report:
                continue
            dest = os.path.join(tmp, name)
            apply(f, p, dest)
            changed += 1

        if not args.report:
            # Only swap anything in once every file has encoded successfully, so a
            # failure halfway through cannot leave the set half-processed.
            for name in os.listdir(tmp):
                shutil.move(os.path.join(tmp, name), os.path.join(AUDIO_DIR, name))
            print(f'\nrewrote {changed} files')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
