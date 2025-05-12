/**
 * Represents a chat message with enhanced security and privacy features
 */
const SecurityUtils = require('../utils/SecurityUtils');
const crypto = require('crypto');

class Message {
    /**
     * Creates a new message with security validation
     * @param {string} id - Unique message identifier
     * @param {string} username - Username of the sender (sanitized)
     * @param {string} text - Message content (sanitized)
     */
    constructor(id, username, text) {
        // Generate ID if not provided
        this.id = id || crypto.randomUUID();

        // Apply strict sanitization to username
        this.username = SecurityUtils.sanitizeText(username, SecurityUtils.SIZE_LIMITS.USERNAME);

        // Sanitize and validate message text
        this.text = this.sanitizeAndValidateText(text);

        // Create timestamp (milliseconds for precision)
        this.timestamp = Date.now();

        // Flag for system messages - explicitly set for system messages
        this.isSystem = username === 'System';
    }

    /**
     * Sanitizes and validates message text with enhanced security
     * @param {string} text - Raw message text
     * @returns {string} Sanitized message text
     * @throws {Error} If text fails security validation
     */
    sanitizeAndValidateText(text) {
        // Initial simple validation
        if (!text || typeof text !== 'string') {
            throw new Error('Message text must be a non-empty string');
        }

        // Check for message size limits
        if (text.length > SecurityUtils.SIZE_LIMITS.MESSAGE) {
            throw new Error(`Message exceeds maximum length of ${SecurityUtils.SIZE_LIMITS.MESSAGE} characters`);
        }

        // Check for suspicious content patterns before sanitization
        if (SecurityUtils.detectSuspiciousContent(text)) {
            throw new Error('Message contains potentially malicious content');
        }

        // Use security utility for consistent sanitization
        const sanitized = SecurityUtils.sanitizeText(text, SecurityUtils.SIZE_LIMITS.MESSAGE);

        // Ensure sanitized text is still valid
        if (!sanitized || sanitized.length === 0) {
            throw new Error('Message contains no valid content after sanitization');
        }

        return sanitized;
    }

    /**
     * Validates if a message text is valid (non-empty and within limits)
     * @param {string} text - Message text to validate
     * @returns {boolean} True if valid, false otherwise
     */
    static isValid(text) {
        if (!text || typeof text !== 'string') return false;

        // Check length and content constraints
        if (text.length === 0 || text.length > SecurityUtils.SIZE_LIMITS.MESSAGE) return false;

        // Check for suspicious content patterns
        if (SecurityUtils.detectSuspiciousContent(text)) return false;

        return SecurityUtils.isValidMessage(text);
    }

    /**
     * Checks if this message is empty or contains only whitespace
     * @returns {boolean} True if message is empty, false otherwise
     */
    isEmpty() {
        return !this.text || this.text.trim().length === 0;
    }

    /**
     * Gets message data safe for transmission
     * Remove any internal properties that shouldn't be exposed
     * @returns {Object} Message data object
     */
    toJSON() {
        return {
            id: this.id,
            username: this.username,
            text: this.text,
            timestamp: this.timestamp,
            isSystem: this.isSystem
        };
    }
}

module.exports = Message;