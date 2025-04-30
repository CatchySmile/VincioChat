/**
 * Represents a chat message
 */
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
      // Basic sanitization - in a production app, use a proper sanitization library
      let sanitized = (text || '').trim();
      
      // Limit length
      const MAX_LENGTH = 2000;
      if (sanitized.length > MAX_LENGTH) {
        sanitized = sanitized.slice(0, MAX_LENGTH);
      }
      
      return sanitized;
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