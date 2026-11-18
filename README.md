# Game Hub

The home page is available at `/`. Open `/cung` to play Archery, `/game` to play
Bowling, and `/thuthanh.html` to play Thủ Thành. Room invite links use the same
path with `?room=<room-code>`.

Thủ Thành enemies descend by parachute and crawl toward the gate. Defeating 10
enemies increases firing speed by 5%; reaching 100% wins and unlocks the Bowling
reward link.

The dashboard reads `/api/rooms` for active Bowling rooms and the Socket.IO
`list_rooms` event for active Archery rooms. Each game's room commands use
separate event names and room channels so their sessions do not interfere.
Shared-world games publish player updates over Socket.IO; their cards observe
those updates without joining as a player.
