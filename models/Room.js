/**
 * Represents a chat room
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
    }
    
    /**
     * Adds a user to the room
     * @param {User} user - User to add
     */
    addUser(user) {
      this.users.set(user.id, user);
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
      return this.users.delete(userId);
    }
    
    /**
     * Adds a message to the room's history
     * @param {Message} message - Message to add
     */
    addMessage(message) {
      this.messages.push(message);
      
      // Cap message history at 100 messages
      if (this.messages.length > 100) {
        this.messages.shift();
      }
    }
    
    /**
     * Checks if a user is the room owner
     * @param {string} userId - User ID to check
     * @returns {boolean} True if user is the owner
     */
    isOwner(userId) {
      return this.owner.id === userId;
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
        createdAt: this.createdAt
      };
    }
  }
  
  module.exports = Room;
