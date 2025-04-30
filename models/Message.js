/**
 * Represents a chat message
 */
const SecurityUtils = require('../utils/SecurityUtils');

class Message {
    /**
     * Creates a new message
     * @param {string} id - Unique message identifier
     * @param {string} username - Username of the sender
     * @param {string} text - Message content
     */
    constructor(id, username, text) {
      this.id = id;
      this.username = username;
      this.text = this.sanitizeText(text);
      this.timestamp = Date.now();
    }
    
    /**
     * Sanitizes message text to prevent injection attacks
     * @param {string} text - Raw message text
     * @returns {string} Sanitized message text
     */
    sanitizeText(text) {
      // Use security utility for consistent sanitization
      return SecurityUtils.sanitizeText(text, SecurityUtils.SIZE_LIMITS.MESSAGE);
    }
    
    /**
     * Gets message data for transmission
     * @returns {Object} Message data object
     */
    toJSON() {
      return {
        id: this.id,
        username: this.username,
        text: this.text,
        timestamp: this.timestamp
      };
    }
}
  
module.exports = Message;
