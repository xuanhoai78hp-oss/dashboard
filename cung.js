'use strict';

const crypto = require('crypto');

function registerArchery(io) {
  const rooms = new Map();
  const roomCodeCharacters = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const disconnectedPlayerGraceMs = 30_000;

  function acknowledge(callback, response) {
    if (typeof callback === 'function') {
      callback(response);
    }
  }

  function normalizePlayerId(value) {
    return typeof value === 'string' && /^[a-z\d-]{1,80}$/i.test(value)
      ? value
      : null;
  }

  function normalizeName(value) {
    return typeof value === 'string'
      ? value.trim().replace(/\s+/g, ' ').slice(0, 20)
      : '';
  }

  function normalizeRoomCode(value) {
    return typeof value === 'string'
      ? value.trim().toUpperCase().replace(/[^A-Z\d]/g, '').slice(0, 6)
      : '';
  }

  function createRoomCode() {
    let code;
    do {
      code = Array.from({ length: 6 }, () => {
        return roomCodeCharacters[crypto.randomInt(roomCodeCharacters.length)];
      }).join('');
    } while (rooms.has(code));
    return code;
  }

  function createPlayer(id, name) {
    return {
      id,
      name,
      score: 0,
      arrows: [],
      history: [],
      connected: true,
      socketId: null,
      removeTimer: null,
      lastArrowId: null,
    };
  }

  function getPublicRoom(room) {
    return {
      code: room.code,
      players: [...room.players.values()].map(({ id, name, score, arrows, history, connected }) => ({
        id,
        name,
        score,
        arrows,
        history,
        connected,
      })),
    };
  }

  function broadcastRoom(room) {
    io.to(`archery:${room.code}`).emit('room_state', getPublicRoom(room));
  }

  function removePlayer(room, playerId, expectedSocketId) {
    const player = room.players.get(playerId);
    if (!player || (expectedSocketId && player.socketId !== expectedSocketId)) {
      return;
    }

    if (player.removeTimer) {
      clearTimeout(player.removeTimer);
    }
    room.players.delete(playerId);
    if (room.players.size === 0) {
      rooms.delete(room.code);
      return;
    }
    broadcastRoom(room);
  }

  function attachPlayer(socket, room, playerId, name) {
    const player = room.players.get(playerId) ?? createPlayer(playerId, name);
    if (player.removeTimer) {
      clearTimeout(player.removeTimer);
      player.removeTimer = null;
    }

    if (player.socketId && player.socketId !== socket.id) {
      const previousSocket = io.sockets.sockets.get(player.socketId);
      previousSocket?.leave(`archery:${room.code}`);
      if (previousSocket) {
        previousSocket.data.archeryRoomCode = null;
        previousSocket.data.archeryPlayerId = null;
      }
    }

    player.name = name;
    player.connected = true;
    player.socketId = socket.id;
    room.players.set(playerId, player);
    socket.join(`archery:${room.code}`);
    socket.data.archeryRoomCode = room.code;
    socket.data.archeryPlayerId = playerId;
    return player;
  }

  function leaveCurrentRoom(socket) {
    const { archeryRoomCode: roomCode, archeryPlayerId: playerId } = socket.data;
    const room = rooms.get(roomCode);
    socket.data.archeryRoomCode = null;
    socket.data.archeryPlayerId = null;
    if (room) {
      removePlayer(room, playerId, socket.id);
    }
    if (roomCode) {
      socket.leave(`archery:${roomCode}`);
    }
  }

  io.on('connection', (socket) => {
    socket.on('list_rooms', (callback) => {
      const activeRooms = [...rooms.values()]
        .map((room) => ({
          code: room.code,
          playerCount: [...room.players.values()].filter((player) => player.connected).length,
        }))
        .filter((room) => room.playerCount > 0)
        .sort((left, right) => right.playerCount - left.playerCount);

      acknowledge(callback, { ok: true, rooms: activeRooms });
    });

    socket.on('archery_create_room', (payload, callback) => {
      const playerId = normalizePlayerId(payload?.playerId);
      const name = normalizeName(payload?.name);
      if (!playerId || !name) {
        acknowledge(callback, { ok: false, error: 'Hãy nhập tên người chơi hợp lệ.' });
        return;
      }

      leaveCurrentRoom(socket);
      const room = { code: createRoomCode(), players: new Map() };
      rooms.set(room.code, room);
      attachPlayer(socket, room, playerId, name);
      acknowledge(callback, { ok: true, room: getPublicRoom(room) });
      broadcastRoom(room);
    });

    socket.on('archery_join_room', (payload, callback) => {
      const roomCode = normalizeRoomCode(payload?.roomCode);
      const playerId = normalizePlayerId(payload?.playerId);
      const name = normalizeName(payload?.name);
      const room = rooms.get(roomCode);
      if (!room) {
        acknowledge(callback, { ok: false, error: 'Không tìm thấy phòng. Hãy kiểm tra mã phòng.' });
        return;
      }
      if (!playerId || !name) {
        acknowledge(callback, { ok: false, error: 'Hãy nhập tên người chơi hợp lệ.' });
        return;
      }

      if (socket.data.archeryRoomCode !== roomCode) {
        leaveCurrentRoom(socket);
      }
      attachPlayer(socket, room, playerId, name);
      acknowledge(callback, { ok: true, room: getPublicRoom(room) });
      broadcastRoom(room);
    });

    socket.on('archery_leave_room', (payload, callback) => {
      const roomCode = normalizeRoomCode(payload?.roomCode);
      if (socket.data.archeryRoomCode === roomCode) {
        leaveCurrentRoom(socket);
      }
      acknowledge(callback, { ok: true });
    });

    socket.on('archery_record_arrow', (payload, callback) => {
      const roomCode = normalizeRoomCode(payload?.roomCode);
      const room = rooms.get(roomCode);
      const player = room?.players.get(socket.data.archeryPlayerId);
      if (!room || socket.data.archeryRoomCode !== roomCode || !player || player.socketId !== socket.id) {
        acknowledge(callback, { ok: false, error: 'Bạn không còn ở trong phòng này.' });
        return;
      }
      if (typeof payload?.arrowId === 'string' && payload.arrowId === player.lastArrowId) {
        acknowledge(callback, { ok: true, room: getPublicRoom(room) });
        return;
      }

      if (
        player.arrows.length >= 10
        || payload?.arrowIndex !== player.arrows.length
        || !Number.isInteger(payload?.score)
        || payload.score < 0
        || payload.score > 10
        || typeof payload.arrowId !== 'string'
        || payload.arrowId.length > 80
      ) {
        acknowledge(callback, { ok: false, error: 'Lượt bắn không khớp với trạng thái ván chơi.' });
        return;
      }

      player.arrows.push(payload.score);
      player.score += payload.score;
      player.lastArrowId = payload.arrowId;
      if (player.arrows.length === 10) {
        player.history.push(player.score);
      }
      const response = { ok: true, room: getPublicRoom(room) };
      broadcastRoom(room);
      acknowledge(callback, response);
    });

    socket.on('archery_restart_player', (payload, callback) => {
      const roomCode = normalizeRoomCode(payload?.roomCode);
      const room = rooms.get(roomCode);
      const player = room?.players.get(socket.data.archeryPlayerId);
      if (!room || socket.data.archeryRoomCode !== roomCode || !player || player.socketId !== socket.id) {
        acknowledge(callback, { ok: false, error: 'Bạn không còn ở trong phòng này.' });
        return;
      }
      if (player.arrows.length !== 10) {
        acknowledge(callback, { ok: false, error: 'Bạn cần hoàn thành ván hiện tại trước.' });
        return;
      }

      player.arrows = [];
      player.score = 0;
      player.lastArrowId = null;
      const response = { ok: true, room: getPublicRoom(room) };
      broadcastRoom(room);
      acknowledge(callback, response);
    });

    socket.on('disconnect', () => {
      const room = rooms.get(socket.data.archeryRoomCode);
      const player = room?.players.get(socket.data.archeryPlayerId);
      if (!room || !player || player.socketId !== socket.id) {
        return;
      }

      player.connected = false;
      player.socketId = null;
      player.removeTimer = setTimeout(() => {
        if (!player.connected) {
          removePlayer(room, player.id);
        }
      }, disconnectedPlayerGraceMs);
      player.removeTimer.unref();
      broadcastRoom(room);
    });
  });

}

module.exports = registerArchery;
