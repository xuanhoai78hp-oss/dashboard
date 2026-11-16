# Game Hub

The home page is available at `/`. Open `/game` to play Bowling and `/cung` to
play Archery. Room invite links use the same path with `?room=<room-code>`.

The dashboard reads `/api/rooms` for active Bowling rooms and the Socket.IO
`list_rooms` event for active Archery rooms. Each game's room commands use
separate event names and room channels so their sessions do not interfere.
Shared-world games publish player updates over Socket.IO; their cards observe
those updates without joining as a player.
