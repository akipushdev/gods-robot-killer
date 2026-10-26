#!/bin/bash
cd "$(dirname "$0")"
[ -d "game" ] && cd game
( sleep 1; open "http://localhost:8765/" ) &
echo "Игра: http://localhost:8765/  — окно не закрывайте, пока играете"
python3 -m http.server 8765
