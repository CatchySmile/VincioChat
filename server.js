const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const rooms = new Map();

app.use(express.static('public'));

// io.engine.clientsCount

// Stats endpoint
// This endpoint is for internal use only and should be restricted in prod

//const getRoomStats = () => {
//  return Array.from(rooms.entries()).map(([roomCode, room]) => ({
//    roomCode,
//    users: room.users.size,
//    messages: room.messages.length,
//    createdAt: room.createdAt,
//    owner: room.owner
//  }));
//};

app.get('/stats', (req, res) => {
  if (req.ip !== '::1' && req.ip !== '') {
    return res.status(403).send('Forbidden');
  }
  res.json({
//    connectedUsers: io.engine.clientsCount, // Logging of this level is not needed
//    activeRooms: rooms.size, // Logging of this level is not needed
//    rooms: getRoomStats(), // Logging of this level is not needed
    heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    uptime: process.uptime(),
    os: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    },
    date: new Date().toISOString()
  });
});


// wget -qO- http://localhost:7070/stats
// curl -X GET http://localhost:7070/stats


//setInterval(() => {
//  display();
//}, 2110);
// Display stats on server start
//display();

// Socket.io connection
io.on('connection', (socket) => {
  socket.data = { roomCode: null, username: null };

  socket.on('createRoom', (username) => {
    const roomCode = uuidv4().slice(0, 12);
    socket.data.roomCode = roomCode;
    socket.data.username = username;

    rooms.set(roomCode, {
      users: new Map([[socket.id, username]]),
      messages: [],
      createdAt: new Date(),
      owner: socket.id
    });

    socket.join(roomCode);
    socket.emit('roomCreated', {
      roomCode,
      users: Array.from(rooms.get(roomCode).users.values())
    });
  });

  socket.on('joinRoom', ({ roomCode, username }) => {
    const room = rooms.get(roomCode);
    if (!room) return socket.emit('error', 'Room not found');

    socket.data.roomCode = roomCode;
    socket.data.username = username;

    room.users.set(socket.id, username);
    socket.join(roomCode);

    socket.emit('roomJoined', {
      roomCode,
      users: Array.from(room.users.values()),
      messages: room.messages
    });

    socket.to(roomCode).emit('userJoined', {
      username,
      users: Array.from(room.users.values())
    });
  });

  socket.on('sendMessage', ({ roomCode, message }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const username = room.users.get(socket.id);
    const messageObj = {
      id: uuidv4(),
      username,
      text: message,
      timestamp: new Date()
    };
    room.messages.push(messageObj);
    io.to(roomCode).emit('newMessage', messageObj);
  });

  socket.on('deleteRoom', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room || room.owner !== socket.id) return;
    io.to(roomCode).emit('roomDeleted', { roomCode });
    rooms.delete(roomCode);
  });

  socket.on('disconnect', () => {
    let { roomCode, username } = socket.data;
    // Fallback if socket.data is not populated
    if (!roomCode || !username) {
      for (const [code, room] of rooms.entries()) {
        if (room.users.has(socket.id)) {
          roomCode = code;
          username = room.users.get(socket.id);
          break;
        }
      }
    }

    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode);
    room.users.delete(socket.id);
    socket.leave(roomCode);
    if (room.users.size === 0) {
      rooms.delete(roomCode);
    } else {
      if (room.owner === socket.id) {
        room.owner = Array.from(room.users.keys())[0];
      }

      io.to(roomCode).emit('userLeft', {
        username,
        users: Array.from(room.users.values()),
        newOwner: room.owner
      });
    }
  });
});
// Refer error 404 to error.html
app.use((req, res, next) => {
  res.status(404).sendFile(__dirname + '/public/error.html');
});

// Ensure socket.io is served from the correct path
app.get('/socket.io/socket.io.js', (req, res) => {
  res.sendFile(__dirname + '/node_modules/socket.io/client-dist/socket.io.js');
});


const PORT = process.env.PORT || 7070;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
