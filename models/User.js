/**
 * Represents a user in the chat application
 */
const SecurityUtils = require('../utils/SecurityUtils');

class User {
    /**
     * Creates a new user
     * @param {string} id - Unique identifier (socket ID)
     * @param {string} username - Display name
     * @param {string} ip - User's IP address (for rate limiting)
     */
    constructor(id, username, ip) {
      this.id = id;
      this.username = this.sanitizeUsername(username);
      this.joinedAt = Date.now();
      this.lastActivity = Date.now();
      this.ip = ip; // Store IP for rate limiting
    }
    
    /**
     * Sanitizes a username to prevent injection attacks
     * @param {string} username - Raw username input
     * @returns {string} Sanitized username
     */
    sanitizeUsername(username) {
      // Use security utility for consistent sanitization
      let sanitized = SecurityUtils.sanitizeText(username, SecurityUtils.SIZE_LIMITS.USERNAME);
      
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
