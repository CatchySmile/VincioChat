/**
 * Represents a chat message with enhanced security, privacy features and encryption
 */
const SecurityUtils = require('../utils/SecurityUtils');
const crypto = require('crypto');

class Message {
    /**
     * Creates a new message with security validation
     * @param {string} id - Unique message identifier
     * @param {string} username - Username of the sender (sanitized)
     * @param {string} text - Message content (sanitized)
     * @param {Object} options - Optional parameters (isEncrypted, roomKey)
     */
    constructor(id, username, text, options = {}) {
        // Generate ID if not provided
        this.id = id || crypto.randomUUID();

        // Apply strict sanitization to username
        this.username = SecurityUtils.sanitizeText(username, SecurityUtils.SIZE_LIMITS.USERNAME);

        // Check if this is an already encrypted message from client
        this.isClientEncrypted = options.isEncrypted || false;

        // Sanitize and validate message text if not already encrypted
        if (!this.isClientEncrypted) {
            this.text = this.sanitizeAndValidateText(text);

            // Encrypt for server-side storage if room key is provided
            if (options.roomKey) {
                this.text = SecurityUtils.encryptMessageForStorage(this.text, options.roomKey);
                this.isServerEncrypted = true;
            } else {
                this.isServerEncrypted = false;
            }
        } else {
            // For client-encrypted messages, store as-is (they're already encrypted)
            this.text = text;
        }

        // Create timestamp (milliseconds for precision)
        this.timestamp = Date.now();

        // Flag for system messages - explicitly set for system messages
        this.isSystem = username === 'System';

        // Store metadata about encryption
        if (options.encryptionMeta) {
            this.encryptionMeta = options.encryptionMeta;
        }
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
     * Decrypts the message text if it's server-encrypted
     * @param {string} roomKey - The key to decrypt the message
     * @returns {string} Decrypted message text
     */
    getDecryptedText(roomKey) {
        if (this.isServerEncrypted && roomKey) {
            return SecurityUtils.decryptMessageFromStorage(this.text, roomKey);
        }
        return this.text;
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
     * @param {string} roomKey - Optional room key for decryption of server-encrypted messages
     * @returns {Object} Message data object
     */
    toJSON(roomKey = null) {
        // Prepare message text - decrypt if server-encrypted
        let messageText = this.text;
        if (this.isServerEncrypted && roomKey) {
            messageText = this.getDecryptedText(roomKey);
        }

        return {
            id: this.id,
            username: this.username,
            text: messageText,
            timestamp: this.timestamp,
            isSystem: this.isSystem,
            isEncrypted: this.isClientEncrypted,
            encryptionMeta: this.encryptionMeta
        };
    }
}

module.exports = Message;