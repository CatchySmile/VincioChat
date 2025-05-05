/**
 * Represents a chat room with enhanced security
 */
class Room {
  /**
   * Creates a new chat room
   * @param {string} code - Unique room code
   * @param {User} owner - User who created the room
   */
  constructor(code, owner) {
    this.code = code;
    this.owner = owner;
    this.users = new Map([[owner.id, owner]]);
    this.messages = [];
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.maxUsers = 50; // Prevent DoS by room filling
    this.maxMessages = 100; // Limit message history for memory management
  }
  
  /**
   * Adds a user to the room
   * @param {User} user - User to add
   * @returns {boolean} True if added, false if room is full
   */
  addUser(user) {
    // Check user limit to prevent DoS
    if (this.users.size >= this.maxUsers) {
      return false;
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
   * Removes a user from the room
   * @param {string} userId - ID of the user to remove
   * @returns {boolean} True if user was removed, false if not found
   */
  removeUser(userId) {
    const result = this.users.delete(userId);
    if (result) {
      this.updateActivity();
    }
    return result;
  }
  
  /**
   * Adds a message to the room's history
   * @param {Message} message - Message to add
   */
  addMessage(message) {
    this.messages.push(message);
    this.updateActivity();
    
    // Cap message history to prevent memory issues
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
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
   */
  updateActivity() {
    this.lastActivity = Date.now();
  }
  
  /**
   * Checks if the room is inactive
   * @param {number} timeout - Inactivity timeout in milliseconds
   * @returns {boolean} True if room is inactive
   */
  isInactive(timeout) {
    return Date.now() - this.lastActivity > timeout;
  }
  
  /**
   * Gets room data safe for transmitting to clients
   * @returns {Object} Room data object
   */
  toJSON() {
    return {
      code: this.code,
      users: Array.from(this.users.values()).map(user => user.toJSON()),
      messageCount: this.messages.length,
      createdAt: this.createdAt,
      ownerId: this.owner ? this.owner.id : null
    };
  }
}

module.exports = Room;
