/**
 * Represents a user in the chat application with enhanced security and privacy
 */
const SecurityUtils = require('../utils/SecurityUtils');
const crypto = require('crypto');

class User {
    /**
     * Creates a new user with enhanced security validation
     * @param {string} id - Unique identifier (socket ID), not logged
     * @param {string} username - Display name, not logged
     * @param {string} ip - User's IP address (for rate limiting), not logged
     */
    constructor(id, username, ip) {
      // Validate required fields
      if (!id) throw new Error('User ID is required');
      if (!username) throw new Error('Username is required');
      if (!ip) throw new Error('IP address is required for rate limiting');
      
      this.id = id;
      this.username = this.sanitizeAndValidateUsername(username);
      this.joinedAt = Date.now();
      this.lastActivity = Date.now();
      this.ip = ip; // Stored only for rate limiting, never logged
      
      // Generate a privacy-preserving hash of IP for minimal logging if needed
      this.ipHash = this.hashIdentifier(ip);
      
      // Activity tracking
      this.messageCount = 0;
      this.lastMessageTime = 0;
      
      // Security tokens
      this.sessionToken = null;
      this.csrfToken = null;
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
      const salt = process.env.HASH_SALT || 'vincio-chat-privacy-salt';
      hash.update(identifier + salt);
      // Return only first 8 characters - enough for differentiation
      // but not enough to reconstruct the original value
      return hash.digest('hex').substring(0, 8);
    }

    /**
     * Sanitizes and validates a username with enhanced security checks
     * @param {string} username - Raw username input
     * @returns {string} Sanitized username
     * @throws {Error} If username fails validation
     */
    sanitizeAndValidateUsername(username) {
      // Check for invalid types
      if (!username || typeof username !== 'string') {
        throw new Error('Username must be a non-empty string');
      }
      
      // Use security utility for consistent sanitization
      let sanitized = SecurityUtils.sanitizeText(username, SecurityUtils.SIZE_LIMITS.USERNAME);
      
      // Apply strict validation (alphanumeric and underscores only)
      if (!SecurityUtils.isValidUsername(sanitized)) {
        throw new Error('Username contains invalid characters. Only letters, numbers, and underscores are allowed.');
      }
      
      // Ensure username isn't too short after sanitization
      if (sanitized.length < 1) {
        throw new Error('Username is too short after sanitization');
      }
      
      return sanitized;
    }
    
    /**
     * Updates the user's last activity timestamp
     * @returns {number} New timestamp
     */
    updateActivity() {
      this.lastActivity = Date.now();
      return this.lastActivity;
    }
    
    /**
     * Tracks when a user sends a message
     * Used for rate limiting and activity monitoring
     */
    trackMessageSent() {
      this.messageCount++;
      this.lastMessageTime = Date.now();
      this.updateActivity();
    }
    
    /**
     * Checks if user is inactive for a given period
     * @param {number} timeoutMs - Timeout in milliseconds
     * @returns {boolean} True if inactive, false otherwise
     */
    isInactive(timeoutMs) {
      return Date.now() - this.lastActivity > timeoutMs;
    }
    
    /**
     * Sets security tokens for the user session
     * @param {string} sessionToken - Authentication token
     * @param {string} csrfToken - CSRF protection token
     */
    setSecurityTokens(sessionToken, csrfToken) {
      this.sessionToken = sessionToken;
      this.csrfToken = csrfToken;
    }
    
    /**
     * Gets user data safe for transmitting to clients
     * Excludes all sensitive information
     * @returns {Object} User data object
     */
    toJSON() {
      return {
        username: this.username,
        joinedAt: this.joinedAt
      };
    }
    
    /**
     * Gets user data for admin purposes
     * Still excludes actual IP address
     * @returns {Object} Extended user data
     */
    toAdminJSON() {
      return {
        username: this.username,
        joinedAt: this.joinedAt,
        lastActivity: this.lastActivity,
        messageCount: this.messageCount,
        ipHash: this.ipHash // Only hash, never actual IP
      };
    }
}
  
module.exports = User;
