/**
 * Represents a user in the chat application
 */
class User {
    /**
     * Creates a new user
     * @param {string} id - Unique identifier (socket ID)
     * @param {string} username - Display name
     */
    constructor(id, username) {
      this.id = id;
      this.username = this.sanitizeUsername(username);
      this.joinedAt = Date.now();
      this.lastActivity = Date.now();
    }
    
    /**
     * Sanitizes a username to prevent injection attacks
     * @param {string} username - Raw username input
     * @returns {string} Sanitized username
     */
    sanitizeUsername(username) {
      // Trim and limit length
      let sanitized = (username || '').trim().slice(0, 20);
      
      // If empty after sanitization, provide a fallback
      if (!sanitized) {
        sanitized = `Guest${Math.floor(Math.random() * 10000)}`;
      }
      
      return sanitized;
    }
    
    /**
     * Updates the user's last activity timestamp
     */
    updateActivity() {
      this.lastActivity = Date.now();
    }
    
    /**
     * Gets user data safe for transmitting to clients
     * @returns {Object} User data object
     */
    toJSON() {
      return {
        username: this.username,
        joinedAt: this.joinedAt
      };
    }
  }
  
  module.exports = User;