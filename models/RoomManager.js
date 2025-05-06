/**
 * Manages all chat rooms with enhanced security, privacy, and resource controls
 */
const Room = require('./Room');
const Message = require('./Message');
const User = require('./User');
const SecurityUtils = require('../utils/SecurityUtils');
const crypto = require('crypto');

class RoomManager {
  /**
   * Creates a new RoomManager
   * @param {Object} logger - Logger utility
   * @param {Object} options - Configuration options
   */
  constructor(logger, options = {}) {
    this.rooms = new Map();
    this.logger = logger || console;
    
    // Configuration
    this.config = {
      maxRoomsPerIp: options.maxRoomsPerIp || 5,
      maxRooms: options.maxRooms || 500, // Global room limit
      roomInactivityTimeout: options.roomInactivityTimeout || 3600000, // 1 hour
      cleanupInterval: options.cleanupInterval || 900000, // 15 minutes
      roomCodeLength: options.roomCodeLength || 12
    };
    
    // Track room creation by IP hash for rate limiting
    this.ipRoomCounter = new Map();
    
    // Initialize periodic cleanup
    this.initializeCleanupSchedule();
  }
  
  /**
   * Creates a new chat room with cryptographically secure room code
   * @param {string} ownerId - Socket ID of the room creator
   * @param {string} ownerName - Username of the room creator
   * @param {string} ip - IP address of the creator (for rate limiting)
   * @param {Object} options - Room configuration options
   * @returns {Room|null} The newly created room or null if limit reached
   */
  createRoom(ownerId, ownerName, ip, options = {}) {
    // Check global room limit to prevent DoS
    if (this.rooms.size >= this.config.maxRooms) {
      this.logger.warn(`Global room limit (${this.config.maxRooms}) reached. Room creation failed.`);
      return null;
    }
    
    // Check IP-based room creation limit
    const ipHash = this.hashIdentifier(ip);
    if (!this.checkRoomCreationLimit(ipHash)) {
      this.logger.warn(`Room creation limit per IP reached for ${ipHash}`);
      return null;
    }
    
    // Generate a secure room code
    let roomCode;
    let attempts = 0;
    const maxAttempts = 10;
    
    do {
      roomCode = this.generateSecureRoomCode();
      attempts++;
      
      if (attempts >= maxAttempts) {
        this.logger.error(`Failed to generate unique room code after ${maxAttempts} attempts`);
        return null;
      }
    } while (this.rooms.has(roomCode));
    
    try {
      // Create owner as first user with properly sanitized username
      const owner = new User(ownerId, ownerName, ip);
      
      // Create the room with provided options
      const roomOptions = {
        maxUsers: options.maxUsers || 50,
        maxMessages: options.maxMessages || 200,
        isPrivate: options.isPrivate || false
      };
      
      const room = new Room(roomCode, owner, roomOptions);
      this.rooms.set(roomCode, room);
      
      // Track room creation for this IP
      this.incrementRoomCounter(ipHash);
      
      this.logger.info(`Room created: ${roomCode} by ${owner.username} (${ownerId})`);
      return room;
    } catch (error) {
      this.logger.error(`Failed to create room: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Creates a privacy-preserving hash of an identifier
   * @param {string} identifier - Identifier to hash
   * @returns {string} Truncated hash
   * @private
   */
  hashIdentifier(identifier) {
    const hash = crypto.createHash('sha256');
    // Use a constant salt to prevent correlation across app restarts
    const salt = process.env.HASH_SALT || 'scratchy-chat-privacy-salt';
    hash.update(identifier + salt);
    // Return only first 8 characters - enough for differentiation
    // but not enough to reconstruct the original value
    return hash.digest('hex').substring(0, 8);
  }
  
  /**
   * Check if IP has reached room creation limit
   * @param {string} ipHash - Hashed IP address
   * @returns {boolean} True if under limit, false if limit reached
   * @private
   */
  checkRoomCreationLimit(ipHash) {
    const counter = this.ipRoomCounter.get(ipHash) || 0;
    return counter < this.config.maxRoomsPerIp;
  }
  
  /**
   * Increment room counter for an IP
   * @param {string} ipHash - Hashed IP address
   * @private
   */
  incrementRoomCounter(ipHash) {
    const currentCount = this.ipRoomCounter.get(ipHash) || 0;
    this.ipRoomCounter.set(ipHash, currentCount + 1);
    
    // Automatically reset counter after 24 hours
    setTimeout(() => {
      const newCount = (this.ipRoomCounter.get(ipHash) || 1) - 1;
      if (newCount <= 0) {
        this.ipRoomCounter.delete(ipHash);
      } else {
        this.ipRoomCounter.set(ipHash, newCount);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours
  }
  
  /**
   * Generates a cryptographically secure room code
   * @returns {string} Secure random room code
   * @private
   */
  generateSecureRoomCode() {
    // Use cryptographically secure random number generator
    return crypto.randomBytes(this.config.roomCodeLength / 2)
      .toString('hex')
      .toUpperCase();
  }
  
  /**
   * Adds a user to an existing room with enhanced validation
   * @param {string} roomCode - Code of the room to join
   * @param {string} userId - Socket ID of the joining user
   * @param {string} username - Username of the joining user
   * @param {string} ip - IP address of the user
   * @returns {Room|null} Room data or null if room doesn't exist or is full
   */
  joinRoom(roomCode, userId, username, ip) {
    // Validate inputs
    if (!roomCode || !userId || !username || !ip) {
      this.logger.warn(`Invalid parameters for joinRoom: ${roomCode}, ${userId}, ${username}`);
      return null;
    }
    
    // Normalize room code for case-insensitive matching
    const normalizedCode = roomCode.toUpperCase();
    
    const room = this.getRoom(normalizedCode);
    if (!room) return null;
    
    try {
      // Create and add the user
      const user = new User(userId, username, ip);
      const added = room.addUser(user);
      
      if (!added) {
        this.logger.warn(`User ${username} (${userId}) could not join room ${normalizedCode}`);
        return null;
      }
      
      this.logger.info(`User ${user.username} (${userId}) joined room: ${normalizedCode}`);
      return room;
    } catch (error) {
      this.logger.error(`Failed to join room: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Removes a user from a room with ownership transfer handling
   * @param {string} userId - Socket ID of the user leaving
   * @returns {Object|null} Room and user data or null if user not found
   */
  leaveRoom(userId) {
    // Find which room the user is in
    for (const [roomCode, room] of this.rooms.entries()) {
      const user = room.getUser(userId);
      if (!user) continue;
      
      const wasOwner = room.isOwner(userId);
      
      // Remove user from room
      const result = room.removeUser(userId);
      if (!result) continue;
      
      const userData = { 
        id: userId, 
        username: result.userData.username,
        wasOwner
      };
      
      // Delete room if empty
      if (room.users.size === 0) {
        this.deleteRoom(roomCode);
        return { roomCode, userData, room: null, newOwnerId: null };
      }
      
      // Return new owner info if ownership changed
      let newOwnerId = null;
      if (wasOwner) {
        const newOwner = room.owner;
        if (newOwner) {
          newOwnerId = newOwner.id;
          this.logger.info(`New owner assigned for room ${roomCode}: ${newOwner.username} (${newOwnerId})`);
        }
      }
      
      this.logger.info(`User ${userData.username} (${userId}) left room: ${roomCode}`);
      return { 
        roomCode, 
        userData,
        room,
        newOwnerId
      };
    }
    
    return null;
  }
  
  /**
   * Kicks a user from a room with optional ban
   * @param {string} roomCode - Room code
   * @param {string} requesterId - ID of the user requesting the kick (must be owner)
   * @param {string} targetUsername - Username of user to kick
   * @param {boolean} ban - Whether to ban the user from rejoining
   * @returns {Object|null} Kicked user info or null if failed
   */
  kickUser(roomCode, requesterId, targetUsername, ban = false) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    
    // Check if requester is room owner
    if (!room.isOwner(requesterId)) {
      return null;
    }
    
    // Find target user by username
    const targetUser = room.getUserByUsername(targetUsername);
    if (!targetUser) return null;
    
    // Prevent kicking yourself
    if (targetUser.id === requesterId) {
      return null;
    }
    
    // Ban user if requested
    if (ban && targetUser.ipHash) {
      room.banUser(targetUser);
    }
    
    // Remove user
    const result = room.removeUser(targetUser.id);
    if (!result) return null;
    
    this.logger.info(`User ${targetUsername} was kicked from room ${roomCode} by owner ${requesterId}`);
    
    return {
      userId: targetUser.id,
      username: targetUser.username,
      banned: ban
    };
  }
  
  /**
   * Checks if a username is already taken in a room
   * @param {string} roomCode - Code of the room
   * @param {string} username - Username to check
   * @returns {boolean} True if username is taken, false otherwise
   */
  isUsernameTaken(roomCode, username) {
    const room = this.getRoom(roomCode);
    if (!room) return false;
    
    // Sanitize username for consistent comparison
    const sanitizedUsername = SecurityUtils.sanitizeText(username, SecurityUtils.SIZE_LIMITS.USERNAME);
    if (!sanitizedUsername) return false;
    
    for (const user of room.users.values()) {
      if (user.username.toLowerCase() === sanitizedUsername.toLowerCase()) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Adds a user message to a room with enhanced validation
   * @param {string} roomCode - Code of the room
   * @param {string} userId - Socket ID of the sender
   * @param {string} text - Message content
   * @returns {Message|null} The created message or null if room/user doesn't exist
   */
  addMessage(roomCode, userId, text) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    
    const user = room.getUser(userId);
    if (!user) return null;
    
    try {
      // Generate a unique message ID that includes sender ID for traceability
      const messageId = `${userId}-${crypto.randomUUID()}`;
      
      // Create message with validation
      const message = new Message(messageId, user.username, text);
      
      // Add to room with rate limiting
      const added = room.addMessage(message);
      if (!added) {
        this.logger.warn(`Message from ${user.username} rate limited in room ${roomCode}`);
        return null;
      }
      
      // Update user activity
      user.updateActivity();
      
      return message;
    } catch (error) {
      this.logger.warn(`Failed to add message to room ${roomCode}: ${error.message}`);
      return null;
    }
  }
  
/**
   * Adds a system message to a room
   * @param {string} roomCode - Code of the room
   * @param {string} text - System message content
   * @returns {Message|null} The created message or null if room doesn't exist
   */
addSystemMessage(roomCode, text) {
  const room = this.getRoom(roomCode);
  if (!room) return null;
  
  try {
    // Sanitize even system messages
    const sanitizedText = SecurityUtils.sanitizeText(text, SecurityUtils.SIZE_LIMITS.MESSAGE);
    
    // Generate a secure unique ID for the message
    const messageId = 'system-' + crypto.randomUUID();
    
    const message = new Message(messageId, 'System', sanitizedText);
    
    // Add to room (bypass rate limiting for system messages)
    room.addMessage(message, true);
    
    return message;
  } catch (error) {
    this.logger.warn(`Failed to add system message to room ${roomCode}: ${error.message}`);
    return null;
  }
}

/**
 * Deletes a room and all associated data
 * @param {string} roomCode - Code of the room to delete
 * @returns {boolean} True if room was deleted, false if it didn't exist
 */
deleteRoom(roomCode) {
  if (!roomCode) return false;
  
  const normalizedCode = roomCode.toUpperCase();
  if (!this.rooms.has(normalizedCode)) return false;
  
  const room = this.rooms.get(normalizedCode);
  this.logger.info(`Room deleted: ${normalizedCode} (had ${room.users.size} users and ${room.messages.length} messages)`);
  
  // Clean up all data
  this.rooms.delete(normalizedCode);
  
  // Return success
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
 * Gets a room by its code with case-insensitive lookup
 * @param {string} roomCode - Code of the room
 * @returns {Room} The room or null if not found
 */
getRoom(roomCode) {
  if (!roomCode) return null;
  
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
  if (!roomCode) return false;
  
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
 * Gets minimal stats about rooms (for monitoring)
 * Ensures no private data is exposed
 * @returns {Object} Room statistics
 */
getStats() {
  const totalUsers = Array.from(this.rooms.values()).reduce(
    (sum, room) => sum + room.users.size, 0
  );
  
  const totalMessages = Array.from(this.rooms.values()).reduce(
    (sum, room) => sum + room.messages.length, 0
  );
  
  return {
    roomCount: this.rooms.size,
    userCount: totalUsers,
    messageCount: totalMessages,
    oldestRoom: this.getOldestRoomAge()
  };
}

/**
 * Gets the age in milliseconds of the oldest active room
 * @returns {number} Age in milliseconds or 0 if no rooms
 * @private
 */
getOldestRoomAge() {
  if (this.rooms.size === 0) return 0;
  
  const now = Date.now();
  let oldestTime = now;
  
  for (const room of this.rooms.values()) {
    if (room.createdAt < oldestTime) {
      oldestTime = room.createdAt;
    }
  }
  
  return now - oldestTime;
}

/**
 * Sets up periodic cleanup of inactive rooms
 * Runs at configured interval and removes rooms inactive for configured timeout
 */
initializeCleanupSchedule() {
  const CLEANUP_INTERVAL = this.config.cleanupInterval;
  const ROOM_EXPIRY = this.config.roomInactivityTimeout;
  
  // Schedule regular cleanup
  setInterval(() => {
    const now = Date.now();
    let deletedCount = 0;
    
    for (const [roomCode, room] of this.rooms.entries()) {
      // Check if room is inactive or has explicitly expired
      if (room.isInactive(ROOM_EXPIRY) || room.isExpired()) {
        this.rooms.delete(roomCode);
        deletedCount++;
        this.logger.info(`Room ${roomCode} deleted due to inactivity (${Math.round((now - room.lastActivity) / 3600000)} hours)`);
      }
    }
    
    if (deletedCount > 0) {
      this.logger.info(`Cleanup: Deleted ${deletedCount} inactive rooms. ${this.rooms.size} rooms remaining.`);
    }
    
    // Periodically clean up rate limit tracking
    if (Math.random() < 0.1) { // 10% chance each cleanup
      this.cleanupRateLimitTracking();
    }
  }, CLEANUP_INTERVAL);
  
  this.logger.info('Room cleanup schedule initialized');
}

/**
 * Clean up stale rate limit tracking data
 * @private
 */
cleanupRateLimitTracking() {
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  
  // Clean entries older than 24 hours
  let cleanedEntries = 0;
  
  // Clean up IP room counter for IPs with 0 rooms
  for (const [ipHash, count] of this.ipRoomCounter.entries()) {
    if (count <= 0) {
      this.ipRoomCounter.delete(ipHash);
      cleanedEntries++;
    }
  }
  
  if (cleanedEntries > 0) {
    this.logger.debug(`Cleaned up ${cleanedEntries} rate limit tracking entries`);
  }
}
}

module.exports = RoomManager;
