# external/

This directory is for local checkouts of upstream projects used for research,
debugging, or optional worker implementations.

Do not commit full upstream source trees here. They are too large and make the
main GitHub repository difficult or impossible to push. The root `.gitignore`
keeps everything under `external/` ignored except this README.

## Current local checkouts

These directories may exist on a developer machine, but should stay untracked:

```text
external/remotion/    # Remotion upstream source, reference only
external/musetalk/    # MuseTalk local digital-human reference implementation
external/cosyvoice/   # CosyVoice local TTS research checkout
external/smartcut/    # smartcut reference only; not used in the MVP path
```

## Project policy

- The Cutix app should depend on published packages where possible.
- The video composition path uses Remotion via npm packages from `platform/`.
- Digital human providers are integrated through adapters, not by vendoring an
  entire upstream model repository into this Git repository.
- Model weights, generated media, datasets, build caches, and browser binaries
  must never be committed.
- If an upstream project needs local patches later, use a separate fork, a
  submodule, or a patch file under a small `docs/` or `patches/` directory.

## Recreate local checkouts

Run these commands only when you need to inspect or test the upstream project
locally:

```powershell
git clone --depth 1 https://github.com/remotion-dev/remotion.git external/remotion
git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git external/musetalk
git clone --depth 1 https://github.com/FunAudioLLM/CosyVoice.git external/cosyvoice
git clone --depth 1 https://github.com/skeskinen/smartcut.git external/smartcut
```

If GitHub clone is unstable, download a source zip manually and unpack it into
the same path. Keep it untracked.

## MVP dependency stance

- `smartcut`: not part of the MVP.
- `remotion`: use npm packages in `platform/`; upstream source is reference only.
- `musetalk`: selected local reference for a digital-human provider adapter.
- `cosyvoice`: optional local TTS provider; production use requires separate
  benchmark and license review.
