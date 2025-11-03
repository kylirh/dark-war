#!/bin/bash

# Convert all AIFF files in reference/sounds/ to OGG format
# Quality setting: -q:a 4 (good balance for game audio)
# Filenames: lowercase with spaces replaced by dashes

SOUNDS_DIR="reference/sounds"

echo "Converting AIFF files to OGG in $SOUNDS_DIR..."

count=0
for file in "$SOUNDS_DIR"/*.aiff; do
  if [ -f "$file" ]; then
    # Get filename without extension
    base=$(basename "$file" .aiff)
    
    # Convert to lowercase and replace spaces with dashes
    normalized=$(echo "$base" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
    output="$SOUNDS_DIR/${normalized}.ogg"
    
    # Convert using FFmpeg with quality setting
    ffmpeg -i "$file" -c:a libvorbis -q:a 4 "$output" -y -loglevel error
    
    # Remove original AIFF file after successful conversion
    if [ $? -eq 0 ]; then
      rm "$file"
      ((count++))
      echo "✓ Converted: ${base}.aiff → ${normalized}.ogg"
    else
      echo "✗ Failed: ${base}.aiff"
    fi
  fi
done

echo ""
echo "Conversion complete: $count files converted to OGG