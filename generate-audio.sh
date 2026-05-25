#!/bin/bash
# Generate a simple ambient rain-like sound as MP3 placeholder
# Requires: sox (apt install sox)

# If sox is not installed, create a tiny silent mp3 placeholder
if ! command -v sox &> /dev/null; then
  echo "sox not found — creating silent placeholder"
  # Create a minimal valid MP3 file (1 second of near-silence)
  printf '\xff\xfb\x90\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' > public/audio/rain.mp3
  exit 0
fi

# Generate 60s rain-like brown noise
sox -n public/audio/rain.mp3 synth 60 brownnoise vol 0.08
echo "Generated ambient audio: public/audio/rain.mp3"
