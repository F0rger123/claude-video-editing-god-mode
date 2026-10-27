#!/usr/bin/env bash
# Check everything ghost-editor needs on this machine, and say how to fix what's missing.
#   bash scripts/doctor.sh
S="$(cd "$(dirname "$0")/.." && pwd)"
ok=0; bad=0
pass() { echo "  ok    $1"; ok=$((ok+1)); }
fail() { echo "  MISS  $1  ->  $2"; bad=$((bad+1)); }

echo "tools"
command -v ffmpeg >/dev/null && pass "ffmpeg $(ffmpeg -version | head -1 | awk '{print $3}')" || fail ffmpeg "brew install ffmpeg"
ffmpeg -hide_banner -buildconf 2>/dev/null | grep -q enable-libvpx && pass "ffmpeg libvpx (alpha WebM memes)" || fail "ffmpeg libvpx" "brew reinstall ffmpeg"
ffmpeg -hide_banner -buildconf 2>/dev/null | grep -q enable-libass && pass "ffmpeg libass" || fail "ffmpeg libass" "brew reinstall ffmpeg"
command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] && pass "node $(node -v)" || fail "node >= 18" "brew install node"
v=$(npx -y hyperframes --version 2>/dev/null | tail -1); [ -n "$v" ] && pass "hyperframes $v" || fail hyperframes "npx -y hyperframes --version (needs network once)"
w=${WHISPER:-$(command -v whisper)}; [ -n "$w" ] && pass "whisper ($w)" || fail whisper "pip install openai-whisper (or set WHISPER=/path)"
command -v yt-dlp >/dev/null && pass "yt-dlp $(yt-dlp --version)" || echo "  opt   yt-dlp not installed: only needed to pull a reference video from a link -> brew install yt-dlp"
python3 -c "import numpy" 2>/dev/null && pass "python numpy" || fail numpy "pip install numpy"
python3 -c "import cv2; cv2.FaceDetectorYN" 2>/dev/null && pass "python opencv (face tracking)" || fail opencv "pip install opencv-python"
python3 -c "import google.genai" 2>/dev/null && pass "python google-genai" || echo "  opt   google-genai not installed: the B-roll check (people rules, line match), own-footage tags, reference study and AI stills need it -> pip install google-genai"
python3 -c "import PIL" 2>/dev/null && pass "python pillow" || fail pillow "pip install pillow"

echo "keys"
if [ -n "$GEMINI_API_KEY" ] || grep -qs '^GEMINI_API_KEY=' "$S/.env"; then pass "GEMINI_API_KEY (env or $S/.env)"; else echo "  opt   GEMINI_API_KEY not set: the B-roll check (broll_vision.py, broll_qa.py people/match; skipped without it), own-footage tags, reference_study.py and AI stills need it; free key: aistudio.google.com/apikey -> export GEMINI_API_KEY=... or $S/.env"; fi

if [ -n "$ELEVENLABS_API_KEY" ] || grep -qs '^ELEVENLABS_API_KEY=' "$S/.env"; then pass "ELEVENLABS_API_KEY (narrated explainers)"; else echo "  opt   ELEVENLABS_API_KEY not set: only scripts/tts_elevenlabs.py (explainer voiceover) needs it -> $S/.env"; fi
[ -x "${DF_VENV:-$S/.venv-df}/bin/deepFilter" ] && pass "DeepFilterNet (scripts/denoise.sh)" || echo "  opt   DeepFilterNet not set up: scripts/denoise.sh installs it on first use (needs python3.11 + uv)"

echo "optional tools (the core skill works without them)"
[ -f "$S/templates/vendor/hf-paper.js" ] && pass "Paper Shaders bundle (templates/vendor/hf-paper.js)" || fail "templates/vendor/hf-paper.js (shader looks)" "git checkout templates/vendor, or rebuild: cd $S/tools/paper && npm install && node build-vendor.mjs"
e=$(ls "$S"/library/emoji/*.webm 2>/dev/null | wc -l | tr -d ' ')
[ "$e" -ge 30 ] && pass "animated emoji ($e Fluent webm)" || echo "  opt   animated emoji not fetched: emoji beats fall back to the font glyph -> python3 -I $S/scripts/emoji_fetch.py (needs ffmpeg libvpx-vp9)"
l=$(ls "$S"/library/luts/*.cube 2>/dev/null | wc -l | tr -d ' ')
[ "$l" -ge 6 ] && pass "film-look LUTs ($l in library/luts)" || echo "  opt   film-look LUTs not generated: only look.film needs them -> bash $S/scripts/setup_looks.sh (venv ~/.venvs/ghost-looks)"
[ -x "${MATTE_VENV:-$HOME/.venvs/ghost-matte}/bin/python" ] && pass "BiRefNet matte (behind beats, cutout beats)" || echo "  opt   BiRefNet matte not set up: behind beats fall back to hyperframes remove-background (u2net), cutout beats need it -> bash $S/scripts/setup_matte.sh (~2.6 GB with weights)"
mc="${CUTOUT_FX_CACHE:-${GHOST_MATTE_CACHE:-$HOME/.cache/ghost-matte}}"
[ -x "${MATTE_VENV:-$HOME/.venvs/ghost-matte}/bin/python" ] && [ ! -f "$mc/hf/BiRefNet_lite/model.safetensors" ] && echo "  opt   BiRefNet_lite weights not cached: cutout beats will download them (176 MB) on first use -> bash $S/scripts/setup_matte.sh"
[ -x "${AUDIOQA_VENV:-$HOME/.venvs/ghost-audioqa}/bin/python" ] && pass "audio QA venv (vad_pauses, voice_enhance)" || echo "  opt   audio QA venv not set up: only autocut --vad, vad_pauses.py and voice_enhance.py need it -> bash $S/scripts/setup_audioqa.sh"
[ -x "${CAPTIONS_VENV:-$HOME/.venvs/ghost-captions}/bin/python" ] && pass "caption metrics venv (scripts/font_metrics.py)" || echo "  opt   caption metrics venv not set up: only needed to add a font to the caption templates -> bash $S/scripts/setup_captions.sh"

echo "recipes"
ls "$S"/templates/fonts/inter-tight-cyrillic.woff2 "$S"/templates/fonts/playfair-display-italic-cyrillic.woff2 >/dev/null 2>&1 && pass "Seoul list / RESULT fonts (Inter Tight, Playfair Display, OFL)" || fail "templates/fonts/inter-tight-*.woff2" "git -C $S checkout templates/fonts"
miss=""; for e in waving-hand hand-splayed point-right running yum eyes fire; do [ -f "$S/library/emoji/$e.webm" ] || miss="$miss,$e"; done
[ -z "$miss" ] && pass "Seoul list emoji (hands, eyes, runner, yum, fire)" || echo "  opt   Seoul list emoji missing (${miss#,}) -> python3 -I $S/scripts/emoji_fetch.py --only ${miss#,}"
[ -f "$S/library/sfx/send-swoosh.wav" ] && pass "Seoul list send sound (send-swoosh)" || echo "  opt   send-swoosh not fetched (Seoul list outro) -> python3 $S/scripts/sfx_fetch.py --only send-swoosh"

echo "library"
n=$(ls "$S"/library/sfx/*.wav 2>/dev/null | wc -l | tr -d ' ')
[ "$n" -ge 30 ] && pass "sfx kit ($n files)" || fail "sfx kit ($n files)" "python3 $S/scripts/library_restore.py --sfx-only"
m=$(ls "$S"/library/memes/*/clip.webm "$S"/library/memes/*/image.png 2>/dev/null | wc -l | tr -d ' ')
if [ "$m" -ge 1 ]; then pass "memes ($m)"
elif [ -f "$S/.public-edition" ]; then echo "  opt   memes: none (public edition; add clips you have rights to with scripts/meme_add.py)"
else fail "memes" "python3 $S/scripts/library_restore.py --memes-only"; fi
ls "$S"/library/music/*.mp3 >/dev/null 2>&1 && pass "music beds" || fail "music beds" "python3 $S/scripts/library_restore.py --music-only"

echo; echo "$ok ok, $bad missing"
[ "$bad" -eq 0 ]
