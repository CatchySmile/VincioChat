/**
 * Manages all chat rooms and their associated data
 */
const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');
const Message = require('../models/Message');
const User = require('../models/User');
const SecurityUtils = require('/utils/SecurityUtils');

class RoomManager {
  constructor(logger) {
    this.rooms = new Map();
    this.logger = logger || console;
    
    // Set up periodic cleanup of inactive rooms
    this.initializeCleanupSchedule();
  }
  
  /**
   * Creates a new chat room
   * @param {string} ownerId - Socket ID of the room creator
   * @param {string} ownerName - Username of the room creator
   * @param {string} ip - IP address of the creator (for rate limiting)
   * @returns {Room} The newly created room
   */
  createRoom(ownerId, ownerName, ip) {
    // Generate a short but unique room code
    let roomCode;
    do {
      roomCode = uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();
    } while (this.rooms.has(roomCode));
    
    // Create owner as first user
    const owner = new User(ownerId, ownerName, ip);
    
    // Create the room
    const room = new Room(roomCode, owner);
    this.rooms.set(roomCode, room);
    
    this.logger.info(`Room created: ${roomCode} by ${ownerName} (${ownerId})`);
    return room;
  }
  
  /**
   * Adds a user to an existing room
   * @param {string} roomCode - Code of the room to join
   * @param {string} userId - Socket ID of the joining user
   * @param {string} username - Username of the joining user
   * @param {string} ip - IP address of the user
   * @returns {Object} Room data or null if room doesn't exist
   */
  joinRoom(roomCode, userId, username, ip) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    
    // Check user limit (prevent DoS by room filling)
    if (room.users.size >= 50) {
      this.logger.warn(`Room ${roomCode} has reached maximum user capacity`);
      return null;
    }
    
    const user = new User(userId, username, ip);
    room.addUser(user);
    room.lastActivity = Date.now();
    
    this.logger.info(`User ${username} (${userId}) joined room: ${roomCode}`);
    return room;
  }
  
  /**
   * Removes a user from a room
   * @param {string} userId - Socket ID of the user leaving
   * @returns {Object} Room and user data or null if user not found
   */
  leaveRoom(userId) {
    // Find which room the user is in
    for (const [roomCode, room] of this.rooms.entries()) {
      const user = room.getUser(userId);
      if (user) {
        const wasOwner = room.isOwner(userId);
        const userData = { 
          id: userId, 
          username: user.username,
          wasOwner
        };
        
        // Remove user from room
        room.removeUser(userId);
        room.lastActivity = Date.now();
        
        // If this was the owner, assign a new one if possible
        let newOwnerId = null;
        if (wasOwner && room.users.size > 0) {
          const newOwner = Array.from(room.users.values())[0];
          room.owner = newOwner;
          newOwnerId = newOwner.id;
          this.logger.info(`New owner assigned for room ${roomCode}: ${newOwner.username} (${newOwnerId})`);
        }
        
        // Delete room if empty
        if (room.users.size === 0) {
          this.deleteRoom(roomCode);
          return { roomCode, userData, room: null, newOwnerId };
        }
        
        this.logger.info(`User ${userData.username} (${userId}) left room: ${roomCode}`);
        return { 
          roomCode, 
          userData,
          room,
          newOwnerId
        };
      }
    }
    
    return null;
  }
  // Duplicate username check
  /**
   * Checks if a username is already taken in a room
   * @param {string} roomCode - Code of the room
   * @param {string} username - Username to check
   * @returns {boolean} True if username is taken, false otherwise
   */
  isUsernameTaken(roomCode, username) {
    const room = this.getRoom(roomCode);
    if (!room) return false;
    
    for (const user of room.users.values()) {
      if (user.username === username) {
        return true;
      }
    }
    
    return false;
  }



  /**
   * Adds a message to a room
   * @param {string} roomCode - Code of the room
   * @param {string} userId - Socket ID of the sender
   * @param {string} text - Message content
   * @returns {Message} The created message or null if room/user doesn't exist
   */
  addMessage(roomCode, userId, text) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    
    const user = room.getUser(userId);
    if (!user) return null;
    
    // Validate message length
    if (text.length > SecurityUtils.SIZE_LIMITS.MESSAGE) {
      text = text.substring(0, SecurityUtils.SIZE_LIMITS.MESSAGE);
    }
    
    const message = new Message(uuidv4(), user.username, text);
    room.addMessage(message);
    room.lastActivity = Date.now();
    
    return message;
  }
  /**
   * Adds a system message to a room
   * @param {string} roomCode - Code of the room
   * @param {string} text - System message content
   * @returns {Message} The created message or null if room doesn't exist
   */
  addSystemMessage(roomCode, text) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    
    const message = new Message(uuidv4(), 'System', text);
    room.addMessage(message);
    room.lastActivity = Date.now();
    
    return message;
  }
  
  /**
   * Deletes a room
   * @param {string} roomCode - Code of the room to delete
   * @returns {boolean} True if room was deleted, false if it didn't exist
   */
  deleteRoom(roomCode) {
    if (!this.rooms.has(roomCode)) return false;
    
    const room = this.rooms.get(roomCode);
    logger.info(`Room deleted: ${roomCode} (had ${room.users.size} users and ${room.messages.length} messages)`);
    
    this.rooms.delete(roomCode);
    return true;
  }
  
  /**
   * Checks if a user is the owner of a room
   * @param {string} roomCode - Code of the room
   * @param {string} userId - Socket ID of the user
   * @returns {boolean} True if user is owner, false otherwise
   */
  isRoomOwner(roomCode, userId) {
    const room = this.getRoom(roomCode);
    if (!room) return false;
    
    return room.isOwner(userId);
  }
  
  /**
   * Gets a room by its code
   * @param {string} roomCode - Code of the room
   * @returns {Room} The room or null if not found
   */
  getRoom(roomCode) {
    // Case-insensitive room code lookup
    const normalizedCode = roomCode.toUpperCase();
    return this.rooms.get(normalizedCode) || null;
  }
  
  /**
   * Checks if a room exists
   * @param {string} roomCode - Code of the room
   * @returns {boolean} True if room exists, false otherwise
   */
  roomExists(roomCode) {
    const normalizedCode = roomCode.toUpperCase();
    return this.rooms.has(normalizedCode);
  }
  
  /**
   * Gets the total number of active rooms
   * @returns {number} Number of rooms
   */
  getRoomCount() {
    return this.rooms.size;
  }
  
  /**
   * Sets up periodic cleanup of inactive rooms
   * Runs every hour and removes rooms inactive for more than 1 hour
   */
  initializeCleanupSchedule() {
    const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
    const ROOM_EXPIRY = 1 * 60 * 60 * 1000; // 1 hours
    
    setInterval(() => {
      const now = Date.now();
      let deletedCount = 0;
      
      for (const [roomCode, room] of this.rooms.entries()) {
        const inactiveTime = now - room.lastActivity;
        
        if (inactiveTime > ROOM_EXPIRY) {
          this.rooms.delete(roomCode);
          deletedCount++;
          logger.info(`Room ${roomCode} deleted due to inactivity (${Math.round(inactiveTime / 3600000)} hours)`);
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`Cleanup: Deleted ${deletedCount} inactive rooms. ${this.rooms.size} rooms remaining.`);
      }
    }, CLEANUP_INTERVAL);
    
    logger.info('Room cleanup schedule initialized');
  }
}

// Force cleanup on startup
const roomManager = new RoomManager();
roomManager.initializeCleanupSchedule();
// Clear all rooms on startup
for (const roomCode of roomManager.rooms.keys()) {
  roomManager.deleteRoom(roomCode);
  logger.info(`Room ${roomCode} cleared on startup`);
}

// Sanitize rooms
for (const room of roomManager.rooms.values()) {
  for (const user of room.users.values()) {
    user.username = SecurityUtils.sanitizeText(user.username, SecurityUtils.SIZE_LIMITS.USERNAME);
  }
  
  for (const message of room.messages) {
    message.text = SecurityUtils.sanitizeText(message.text, SecurityUtils.SIZE_LIMITS.MESSAGE);
  }
}

module.exports = RoomManager;
