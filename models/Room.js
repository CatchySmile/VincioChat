/**
 * Represents a chat room with enhanced security and resource management
 */
const SecurityUtils = require('../utils/SecurityUtils');

class Room {
  /**
   * Creates a new chat room with security controls
   * @param {string} code - Unique room code
   * @param {User} owner - User who created the room
   * @param {Object} options - Optional room configuration
   */
  constructor(code, owner, options = {}) {
    // Validate required parameters
    if (!code || typeof code !== 'string') {
      throw new Error('Room code is required and must be a string');
    }
    if (!owner) {
      throw new Error('Room owner is required');
    }
    
    this.code = code.toUpperCase(); // Ensure consistent uppercase format
    this.owner = owner;
    this.users = new Map([[owner.id, owner]]);
    this.messages = [];
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    
    // Room capacity controls to prevent DoS
    this.maxUsers = options.maxUsers || 50;
    this.maxMessages = options.maxMessages || 200;
    
    // Privacy and security settings
    this.isPrivate = options.isPrivate || false;
    this.expiryTime = options.expiryTime || null; // Optional auto-expiry
    
    // Track banned users to prevent immediate rejoin
    this.bannedUsers = new Set(); // Store IP hashes, never actual IPs
    
    // Track rate limit violations
    this.rateLimitViolations = new Map();
  }
  
  /**
   * Adds a user to the room with checks for banned status
   * @param {User} user - User to add
   * @returns {boolean} True if added, false if room is full or user is banned
   */
  addUser(user) {
    // Check if user is banned
    if (this.bannedUsers.has(user.ipHash)) {
      return false;
    }
    
    // Check user limit to prevent DoS
    if (this.users.size >= this.maxUsers) {
      return false;
    }
    
    // Check if username is already taken
    for (const existingUser of this.users.values()) {
      if (existingUser.username.toLowerCase() === user.username.toLowerCase()) {
        return false;
      }
    }
    
    this.users.set(user.id, user);
    this.updateActivity();
    return true;
  }
  
  /**
   * Gets a user from the room
   * @param {string} userId - ID of the user to get
   * @returns {User} User object or undefined if not found
   */
  getUser(userId) {
    return this.users.get(userId);
  }
  
  /**
   * Gets a user by their username
   * @param {string} username - Username to look for (case insensitive)
   * @returns {User|null} User object or null if not found
   */
  getUserByUsername(username) {
    if (!username) return null;
    
    const normalizedName = username.toLowerCase();
    for (const user of this.users.values()) {
      if (user.username.toLowerCase() === normalizedName) {
        return user;
      }
    }
    return null;
  }
  
  /**
   * Removes a user from the room
   * @param {string} userId - ID of the user to remove
   * @returns {Object|null} Removed user data or null if not found
   */
  removeUser(userId) {
    const user = this.getUser(userId);
    if (!user) return null;
    
    const userData = user.toJSON();
    const result = this.users.delete(userId);
    
    if (result) {
      this.updateActivity();
      
      // Reassign owner if the owner left
      if (this.isOwner(userId) && this.users.size > 0) {
        this.assignNewOwner();
      }
    }
    
    return { userData, wasOwner: this.isOwner(userId) };
  }
  
  /**
   * Assigns a new owner from remaining users
   * @returns {User|null} New owner or null if no users remain
   */
  assignNewOwner() {
    if (this.users.size === 0) return null;
    
    // Get the first user (oldest in the room) as new owner
    const [firstUserId] = this.users.keys();
    this.owner = this.users.get(firstUserId);
    return this.owner;
  }
  
  /**
   * Temporarily bans a user from rejoining the room
   * @param {User} user - User to ban
   * @param {number} durationMs - Ban duration in milliseconds
   * @returns {boolean} True if banned, false if already banned
   */
  banUser(user) {
    if (!user || !user.ipHash) return false;
    
    if (this.bannedUsers.has(user.ipHash)) {
      return false;
    }
    
    this.bannedUsers.add(user.ipHash);
    
    // Auto-expire ban after 1 hour (prevent permanent ban on ephemeral system)
    setTimeout(() => {
      this.bannedUsers.delete(user.ipHash);
    }, 60 * 60 * 1000); // 1 hour
    
    return true;
  }
  
  /**
   * Adds a message to the room's history with rate limiting
   * @param {Message} message - Message to add
   * @param {boolean} isSystemMessage - Whether this is a system message (bypass limits)
   * @returns {boolean} True if message was added
   */
  addMessage(message, isSystemMessage = false) {
    // System messages bypass normal limits
    if (!isSystemMessage) {
      // Check rate limiting
      const userId = message.id.split('-')[0]; // Extract user ID if in format "userId-messageId"
      const user = this.getUser(userId);
      
      if (user) {
        user.trackMessageSent();
        
        // Check for rate limit violations
        const now = Date.now();
        const messageRateWindow = 5000; // 5 second window
        const messageRateLimit = 10; // Max 10 messages per window
        
        if (!this.rateLimitViolations.has(userId)) {
          this.rateLimitViolations.set(userId, {
            count: 1,
            window: now + messageRateWindow
          });
        } else {
          const violation = this.rateLimitViolations.get(userId);
          
          // Reset window if expired
          if (now > violation.window) {
            violation.count = 1;
            violation.window = now + messageRateWindow;
          } else {
            violation.count++;
            
            // Block message if rate limit exceeded
            if (violation.count > messageRateLimit) {
              return false;
            }
          }
        }
      }
    }
    
    this.messages.push(message);
    this.updateActivity();
    
    // Cap message history to prevent memory issues
    if (this.messages.length > this.maxMessages) {
      // Remove oldest messages
      this.messages = this.messages.slice(-this.maxMessages);
    }
    
    return true;
  }
  
  /**
   * Checks if a user is the room owner
   * @param {string} userId - User ID to check
   * @returns {boolean} True if user is the owner
   */
  isOwner(userId) {
    return this.owner && this.owner.id === userId;
  }
  
  /**
   * Updates the room's activity timestamp
   * @returns {number} New timestamp
   */
  updateActivity() {
    this.lastActivity = Date.now();
    return this.lastActivity;
  }
  
  /**
   * Checks if the room is inactive for cleanup
   * @param {number} timeout - Inactivity timeout in milliseconds
   * @returns {boolean} True if room is inactive
   */
  isInactive(timeout) {
    return Date.now() - this.lastActivity > timeout;
  }
  
  /**
   * Checks if the room has expired (if expiry time was set)
   * @returns {boolean} True if room has expired
   */
  isExpired() {
    if (!this.expiryTime) return false;
    return Date.now() > this.expiryTime;
  }
  
  /**
   * Gets the most recent messages, limited to a specified amount
   * @param {number} limit - Maximum number of messages to return
   * @returns {Array} Limited messages array
   */
  getRecentMessages(limit = 50) {
    const safeLimit = Math.min(limit, this.maxMessages);
    return this.messages.slice(-safeLimit);
  }
  
  /**
   * Gets room data safe for transmitting to clients
   * @param {boolean} includeMessages - Whether to include message history
   * @returns {Object} Room data object
   */
  toJSON(includeMessages = false) {
    const result = {
      code: this.code,
      users: Array.from(this.users.values()).map(user => user.toJSON()),
      userCount: this.users.size,
      messageCount: this.messages.length,
      createdAt: this.createdAt,
      ownerId: this.owner ? this.owner.id : null
    };
    
    // Only include recent messages if specifically requested
    if (includeMessages) {
      result.messages = this.getRecentMessages(50).map(msg => msg.toJSON());
    }
    
    return result;
  }
}

module.exports = Room;
