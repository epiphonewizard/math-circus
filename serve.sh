#!/bin/bash
# Serves the game on your home Wi-Fi so a tablet can open it.
cd "$(dirname "$0")"
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost)
echo ""
echo "  Digital Math Circus is running!"
echo "  On this Mac:     http://localhost:8000"
echo "  On the tablet:   http://$IP:8000   (same Wi-Fi)"
echo "  Press Ctrl+C to stop."
echo ""
python3 -m http.server 8000
