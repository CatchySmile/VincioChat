/**
 * Handles all Socket.IO events and communication
 */
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
  }
  
  /**
   * Initializes socket connection handling
   */
  initialize() {
    this.io.on('connection', (socket) => {
      this.logger.info(`New client connected: ${socket.id}`);
      
      // Track this socket
      this.userSockets.set(socket.id, {
        id: socket.id,
        roomCode: null,
        username: null
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
      // Validate username
      if (!username || typeof username !== 'string' || username.trim() === '') {
        return socket.emit('error', 'Invalid username');
      }
      
      // Create the room
      const room = this.roomManager.createRoom(socket.id, username);
      
      // Update user tracking
      this.userSockets.set(socket.id, {
        id: socket.id,
        roomCode: room.code,
        username: username
      });
      
      // Join the socket to the room
      socket.join(room.code);
      
      // Send room data back to the client
      socket.emit('roomCreated', {
        roomCode: room.code,
        users: Array.from(room.users.values()).map(u => u.username)
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
      
      // Validate inputs
      if (!roomCode || !username) {
        return socket.emit('error', 'Room code and username are required');
      }
      
      // Try to join the room
      const room = this.roomManager.joinRoom(roomCode, socket.id, username);
      if (!room) {
        return socket.emit('error', 'Room not found');
      }
      
      // Update user tracking
      this.userSockets.set(socket.id, {
        id: socket.id,
        roomCode: room.code,
        username: username
      });
      
      // Join the socket to the room
      socket.join(room.code);
      
      // Send room data back to the client
      socket.emit('roomJoined', {
        roomCode: room.code,
        users: Array.from(room.users.values()).map(u => u.username),
        messages: room.messages
      });
      
      // Notify other users in the room
      socket.to(room.code).emit('userJoined', {
        username: username,
        users: Array.from(room.users.values()).map(u => u.username)
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
      
      // Validate inputs
      if (!roomCode || !message || message.trim() === '') {
        return socket.emit('error', 'Room code and message are required');
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
          users: Array.from(room.users.values()).map(u => u.username),
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
            users: Array.from(result.room.users.values()).map(u => u.username),
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
}

module.exports = SocketHandler;