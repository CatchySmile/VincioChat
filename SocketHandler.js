/**
 * Handles all Socket.IO events and communication
 */
const SecurityUtils = require('../utils/SecurityUtils');

class SocketHandler {
  /**
   * Creates a new SocketHandler
   * @param {Object} io - Socket.IO server instance
   * @param {Object} roomManager - Room manager instance
   * @param {Object} logger - Logger utility
   */
  constructor(io, roomManager, logger) {
    this.io = io;
    this.roomManager = roomManager;
    this.logger = logger;
    
    // Track user details by socket ID
    this.userSockets = new Map();
    
    // Track IP addresses for rate limiting
    this.ipConnections = new Map();
  }
  
  /**
   * Gets client IP address from socket handshake
   * @param {Object} socket - Socket.IO socket
   * @returns {string} Client IP address
   */
  getClientIp(socket) {
    // Get IP address from socket handshake
    return socket.handshake.headers['x-forwarded-for'] || 
           socket.handshake.address || 
           'unknown';
  }
  
  /**
   * Initializes socket connection handling
   */
  initialize() {
    this.io.on('connection', (socket) => {
      const clientIp = this.getClientIp(socket);
      
      // Check connection rate limit
      if (SecurityUtils.isRateLimited(clientIp, 'connections')) {
        this.logger.warn(`Rate limit exceeded for connections from IP: ${clientIp}`);
        socket.emit('error', 'Too many connection attempts. Please try again later.');
        socket.disconnect(true);
        return;
      }
      
      this.logger.info(`New client connected: ${socket.id} from ${clientIp}`);
      
      // Track this socket
      this.userSockets.set(socket.id, {
        id: socket.id,
        roomCode: null,
        username: null,
        ip: clientIp
      });
      
      // Set up event handlers for this socket
      this.setupEventHandlers(socket);
    });
  }
  
  /**
   * Sets up all event handlers for a socket
   * @param {Object} socket - Socket.IO socket instance
   */
  setupEventHandlers(socket) {
    // Create Room
    socket.on('createRoom', (username) => this.handleCreateRoom(socket, username));
    
    // Join Room
    socket.on('joinRoom', (data) => this.handleJoinRoom(socket, data));
    
    // Send Message
    socket.on('sendMessage', (data) => this.handleSendMessage(socket, data));
    
    // Delete Room
    socket.on('deleteRoom', (roomCode) => this.handleDeleteRoom(socket, roomCode));
    
    // Leave Room (explicit)
    socket.on('leaveRoom', (roomCode) => this.handleLeaveRoom(socket, roomCode));
    
    // Disconnect
    socket.on('disconnect', () => this.handleDisconnect(socket));
    
    // Error handling
    socket.on('error', (error) => {
      this.logger.error(`Socket error for ${socket.id}: ${error.message}`);
    });
  }
  
  /**
   * Handles room creation
   * @param {Object} socket - Socket.IO socket instance
   * @param {string} username - Username of the room creator
   */
  handleCreateRoom(socket, username) {
    try {
      const clientIp = this.getClientIp(socket);
      
      // Check room creation rate limit
      if (SecurityUtils.isRateLimited(clientIp, 'rooms')) {
        this.logger.warn(`Rate limit exceeded for room creation from IP: ${clientIp}`);
        socket.emit('error', 'You are creating rooms too quickly. Please try again later.');
        return;
      }
      
      // Validate username
      if (!SecurityUtils.isValidUsername(username)) {
        return socket.emit('error', 'Invalid username. Username must be between 1-20 characters.');
      }
      
      // Create the room with client IP for the user
      const room = this.roomManager.createRoom(socket.id, username, clientIp);
      
      // Update user tracking
      this.userSockets.set(socket.id, {
        id: socket.id,
        roomCode: room.code,
        username: username,
        ip: clientIp
      });
      
      // Join the socket to the room
      socket.join(room.code);
      
      // Send room data back to the client
      socket.emit('roomCreated', {
        roomCode: room.code,
        users: Array.from(room.users.values()).map(u => u.toJSON().username),
        messageSizeLimit: SecurityUtils.SIZE_LIMITS.MESSAGE
      });
      
      this.logger.info(`Room created: ${room.code} by ${username} (${socket.id})`);
    } catch (error) {
      this.logger.error(`Error creating room: ${error.message}`);
      socket.emit('error', 'Failed to create room');
    }
  }
  
  /**
   * Handles joining an existing room
   * @param {Object} socket - Socket.IO socket instance
   * @param {Object} data - Join data (roomCode, username)
   */
  handleJoinRoom(socket, data) {
    try {
      const { roomCode, username } = data;
      const clientIp = this.getClientIp(socket);
      
      // Validate inputs
      if (!roomCode || !username) {
        return socket.emit('error', 'Room code and username are required');
      }
      
      if (!SecurityUtils.isValidRoomCode(roomCode)) {
        return socket.emit('error', 'Invalid room code format');
      }
      
      if (!SecurityUtils.isValidUsername(username)) {
        return socket.emit('error', 'Invalid username. Username must be between 1-20 characters.');
      }
      
      // Try to join the room
      const room = this.roomManager.joinRoom(roomCode, socket.id, username, clientIp);
      if (!room) {
        return socket.emit('error', 'Room not found');
      }
      
      // Update user tracking
      this.userSockets.set(socket.id, {
        id: socket.id,
        roomCode: room.code,
        username: username,
        ip: clientIp
      });
      
      // Join the socket to the room
      socket.join(room.code);
      
      // Send room data back to the client
      socket.emit('roomJoined', {
        roomCode: room.code,
        users: Array.from(room.users.values()).map(u => u.toJSON().username),
        messages: room.messages,
        messageSizeLimit: SecurityUtils.SIZE_LIMITS.MESSAGE
      });
      
      // Notify other users in the room
      socket.to(room.code).emit('userJoined', {
        username: username,
        users: Array.from(room.users.values()).map(u => u.toJSON().username)
      });
      
      // Create system message about user joining
      const joinMessage = this.roomManager.addSystemMessage(room.code, `${username} joined the room`);
      if (joinMessage) {
        socket.to(room.code).emit('newMessage', joinMessage);
      }
      
      this.logger.info(`User ${username} (${socket.id}) joined room: ${room.code}`);
    } catch (error) {
      this.logger.error(`Error joining room: ${error.message}`);
      socket.emit('error', 'Failed to join room');
    }
  }
  
  /**
   * Handles sending a message in a room
   * @param {Object} socket - Socket.IO socket instance
   * @param {Object} data - Message data (roomCode, message)
   */
  handleSendMessage(socket, data) {
    try {
      const { roomCode, message } = data;
      const clientIp = this.getClientIp(socket);
      
      // Check message rate limit
      if (SecurityUtils.isRateLimited(clientIp, 'messages')) {
        this.logger.warn(`Rate limit exceeded for messages from IP: ${clientIp}`);
        socket.emit('error', 'You are sending messages too quickly. Please slow down.');
        return;
      }
      
      // Validate inputs
      if (!roomCode || !message) {
        return socket.emit('error', 'Room code and message are required');
      }
      
      if (!SecurityUtils.isValidRoomCode(roomCode)) {
        return socket.emit('error', 'Invalid room code format');
      }
      
      if (!SecurityUtils.isValidMessage(message)) {
        return socket.emit('error', `Invalid message format or empty message`);
      }
      
      // Check if message exceeds size limit
      if (message.length > SecurityUtils.SIZE_LIMITS.MESSAGE) {
        return socket.emit('error', `Message exceeds maximum length of ${SecurityUtils.SIZE_LIMITS.MESSAGE} characters`);
      }
      
      // Check if user is in this room
      const userData = this.userSockets.get(socket.id);
      if (!userData || userData.roomCode !== roomCode) {
        return socket.emit('error', 'You are not in this room');
      }
      
      // Add the message to the room
      const messageObj = this.roomManager.addMessage(roomCode, socket.id, message);
      if (!messageObj) {
        return socket.emit('error', 'Failed to send message');
      }
      
      // Broadcast message to all users in the room
      this.io.to(roomCode).emit('newMessage', messageObj);
      
      this.logger.debug(`Message in room ${roomCode} from ${userData.username}: ${message.substring(0, 20)}${message.length > 20 ? '...' : ''}`);
    } catch (error) {
      this.logger.error(`Error sending message: ${error.message}`);
      socket.emit('error', 'Failed to send message');
    }
  }
  
  /**
   * Handles room deletion
   * @param {Object} socket - Socket.IO socket instance
   * @param {string} roomCode - Code of the room to delete
   */
  handleDeleteRoom(socket, roomCode) {
    try {
      // Validate room code
      if (!SecurityUtils.isValidRoomCode(roomCode)) {
        return socket.emit('error', 'Invalid room code format');
      }
      
      // Check if room exists
      if (!this.roomManager.roomExists(roomCode)) {
        return socket.emit('error', 'Room not found');
      }
      
      // Check if user is the room owner
      if (!this.roomManager.isRoomOwner(roomCode, socket.id)) {
        return socket.emit('error', 'Only the room owner can delete the room');
      }
      
      // Notify all users in the room
      this.io.to(roomCode).emit('roomDeleted', { roomCode });
      
      // Remove all sockets from the room
      this.io.in(roomCode).socketsLeave(roomCode);
      
      // Update user tracking for all users in this room
      for (const [socketId, userData] of this.userSockets.entries()) {
        if (userData.roomCode === roomCode) {
          userData.roomCode = null;
        }
      }
      
      // Delete the room
      this.roomManager.deleteRoom(roomCode);
      
      this.logger.info(`Room ${roomCode} deleted by ${socket.id}`);
    } catch (error) {
      this.logger.error(`Error deleting room: ${error.message}`);
      socket.emit('error', 'Failed to delete room');
    }
  }
  
  /**
   * Handles a user explicitly leaving a room
   * @param {Object} socket - Socket.IO socket instance
   * @param {string} roomCode - Code of the room to leave
   */
  handleLeaveRoom(socket, roomCode) {
    try {
      // Validate room code
      if (!SecurityUtils.isValidRoomCode(roomCode)) {
        return socket.emit('error', 'Invalid room code format');
      }
      
      const userData = this.userSockets.get(socket.id);
      if (!userData || userData.roomCode !== roomCode) {
        return;
      }
      
      // Store the username before leaving the room
      const username = userData.username;
      
      // Process user leaving
      const result = this.roomManager.leaveRoom(socket.id);
      if (!result) return;
      
      // Update user tracking
      userData.roomCode = null;
      
      // Leave the socket room
      socket.leave(roomCode);
      
      // If room still exists, notify remaining users
      if (this.roomManager.roomExists(roomCode)) {
        const room = this.roomManager.getRoom(roomCode);
        
        // Create system message about user leaving
        const leaveMessage = this.roomManager.addSystemMessage(roomCode, `${username} left the room`);
        if (leaveMessage) {
          this.io.to(roomCode).emit('newMessage', leaveMessage);
        }
        
        // Notify about user leaving and potential ownership changes
        this.io.to(roomCode).emit('userLeft', {
          username: username,
          users: Array.from(room.users.values()).map(u => u.toJSON().username),
          newOwner: result.newOwnerId
        });
      }
      
      this.logger.info(`User ${username} (${socket.id}) left room: ${roomCode}`);
    } catch (error) {
      this.logger.error(`Error leaving room: ${error.message}`);
      socket.emit('error', 'Failed to leave room');
    }
  }
  
  /**
   * Handles disconnection of a socket
   * @param {Object} socket - Socket.IO socket instance
   */
  handleDisconnect(socket) {
    try {
      const userData = this.userSockets.get(socket.id);
      if (!userData) return;
      
      // If user was in a room, handle leaving
      if (userData.roomCode) {
        // Store username before processing leave
        const username = userData.username;
        const roomCode = userData.roomCode;
        
        const result = this.roomManager.leaveRoom(socket.id);
        if (result && this.roomManager.roomExists(result.roomCode)) {
          // Create system message about user leaving
          const leaveMessage = this.roomManager.addSystemMessage(roomCode, `${username} left the room`);
          if (leaveMessage) {
            this.io.to(roomCode).emit('newMessage', leaveMessage);
          }
          
          // Notify remaining users
          this.io.to(result.roomCode).emit('userLeft', {
            username: username,
            users: Array.from(result.room.users.values()).map(u => u.toJSON().username),
            newOwner: result.newOwnerId
          });
        }
      }
      
      // Remove from user tracking
      this.userSockets.delete(socket.id);
      
      this.logger.info(`Client disconnected: ${socket.id}`);
    } catch (error) {
      this.logger.error(`Error handling disconnect: ${error.message}`);
    }
  }
  //  Socket Cleaner
  /**
   * Cleans up old sockets and rooms
   */
  cleanUp() {
    const now = Date.now();
    
    // Check for inactive rooms
    for (const [roomCode, room] of this.roomManager.rooms.entries()) {
      if (now - room.lastActivity > SecurityUtils.ROOM_INACTIVITY_TIMEOUT) {
        this.logger.info(`Deleting inactive room: ${roomCode}`);
        this.roomManager.deleteRoom(roomCode);
      }
    }
    
    // Check for inactive sockets
    for (const [socketId, userData] of this.userSockets.entries()) {
      if (now - userData.lastActivity > SecurityUtils.SOCKET_INACTIVITY_TIMEOUT) {
        this.logger.info(`Disconnecting inactive socket: ${socketId}`);
        this.io.sockets.sockets.get(socketId).disconnect(true);
        this.userSockets.delete(socketId);
      }
    }
  }
  // Encrypt socket data
  /**
   * Encrypts socket data
   * @param {Object} socket - Socket.IO socket instance
   * @param {string} data - Data to encrypt
   * @returns {string} Encrypted data
   */
  encryptSocketData(socket, data) {
    try {
      const encryptedData = SecurityUtils.encrypt(data, socket.id);
      return encryptedData;
    } catch (error) {
      this.logger.error(`Error encrypting socket data: ${error.message}`);
      return null;
    }
  }
}

// Ensure message is sent from the correct user
SocketHandler.prototype.validateMessageSender = function(socket, message) {
  const userData = this.userSockets.get(socket.id);
  if (!userData || userData.username !== message.sender) {
    this.logger.warn(`Invalid message sender: ${message.sender}`);
    return false;
  }
  return true;
};
// Ensure socket.io is served from the correct path
SocketHandler.prototype.serveSocketIO = function(req, res) {
  res.sendFile(__dirname + '/node_modules/socket.io/client-dist/socket.io.js');
};


module.exports = SocketHandler;
