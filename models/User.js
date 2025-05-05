/**
 * Represents a user in the chat application with enhanced security
 */
const SecurityUtils = require('../utils/SecurityUtils');

class User {
    /**
     * Creates a new user
     * @param {string} id - Unique identifier (socket ID), not logged.
     * @param {string} username - Display name, not logged.
     * @param {string} ip - User's IP address (for rate limiting), not logged.
     */
    constructor(id, username, ip) {
      this.id = id;
      this.username = this.sanitizeUsername(username);
      this.joinedAt = Date.now();
      this.lastActivity = Date.now();
      this.ip = ip; // For rate limiting, not logged.
    }

    /**
     * Sanitizes a username to prevent injection attacks
     * @param {string} username - Raw username input
     * @returns {string} Sanitized username
     */
    sanitizeUsername(username) {
      // Use security utility for consistent sanitization
      let sanitized = SecurityUtils.sanitizeText(username, SecurityUtils.SIZE_LIMITS.USERNAME);
      
      // Ensure username only contains allowed characters
      if (!SecurityUtils.isValidUsername(sanitized)) {
        // Generate a random safe username as fallback
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
     * Excludes sensitive information like IP
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
