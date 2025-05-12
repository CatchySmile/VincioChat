/**
 * Manages all chat rooms with enhanced security, privacy, and resource controls
 * Addresses:
 * - Memory leaks in room counter timeouts
 * - Improved error handling
 * - Resource monitoring
 * - Performance optimizations
 */
const Room = require('./Room');
const Message = require('./Message');
const User = require('./User');
const SecurityUtils = require('../utils/SecurityUtils');
const crypto = require('crypto');
const EventEmitter = require('events');

class RoomManager {
    /**
     * Creates a new RoomManager
     * @param {Object} logger - Logger utility
     * @param {Object} options - Configuration options
     */
    constructor(logger, options = {}) {
        this.rooms = new Map();
        this.logger = logger || console;
        this.eventEmitter = new EventEmitter();

        // Configuration - allow overriding via environment variables
        this.config = {
            maxRoomsPerIp: options.maxRoomsPerIp || (process.env.MAX_ROOMS_PER_IP ? parseInt(process.env.MAX_ROOMS_PER_IP) : 5),
            maxRooms: options.maxRooms || (process.env.MAX_ROOMS ? parseInt(process.env.MAX_ROOMS) : 500),
            roomInactivityTimeout: options.roomInactivityTimeout || (process.env.ROOM_INACTIVITY_TIMEOUT ?
                parseInt(process.env.ROOM_INACTIVITY_TIMEOUT) : 3600000), // 1 hour
            cleanupInterval: options.cleanupInterval || (process.env.CLEANUP_INTERVAL ?
                parseInt(process.env.CLEANUP_INTERVAL) : 900000), // 15 minutes
            roomCodeLength: options.roomCodeLength || (process.env.ROOM_CODE_LENGTH ?
                parseInt(process.env.ROOM_CODE_LENGTH) : 24),
            memoryMonitoringInterval: options.memoryMonitoringInterval || (process.env.MEMORY_MONITORING_INTERVAL ?
                parseInt(process.env.MEMORY_MONITORING_INTERVAL) : 60000), // 1 minute
            memoryWarningThreshold: options.memoryWarningThreshold || (process.env.MEMORY_WARNING_THRESHOLD ?
                parseInt(process.env.MEMORY_WARNING_THRESHOLD) : 1024) // 1GB in MB
        };

        // Track room creation by IP hash for rate limiting
        this.ipRoomCounter = new Map();

        // Track timeouts for proper cleanup
        this.timeouts = new Map();

        // Memory monitoring
        this.memoryStats = {
            lastCheck: Date.now(),
            roomCount: 0,
            userCount: 0,
            messageCount: 0,
            memoryUsage: 0
        };

        // Initialize periodic cleanup and monitoring
        this.initializeCleanupSchedule();
        this.initializeMemoryMonitoring();
    }

    /**
     * Creates a new chat room with cryptographically secure room code
     * @param {string} ownerId - Socket ID of the room creator
     * @param {string} ownerName - Username of the room creator
     * @param {string} ip - IP address of the creator (for rate limiting)
     * @param {Object} options - Room configuration options
     * @returns {Room|null} The newly created room or null if limit reached
     */
    createRoom(ownerId, ownerName, ip, options = {}) {
        try {
            // Check global room limit to prevent DoS
            if (this.rooms.size >= this.config.maxRooms) {
                this.logger.warn(`Global room limit (${this.config.maxRooms}) reached. Room creation failed.`);
                return null;
            }

            // Check IP-based room creation limit
            const ipHash = this.hashIdentifier(ip);
            if (!this.checkRoomCreationLimit(ipHash)) {
                this.logger.warn(`Room creation limit per IP reached for ${ipHash}`);
                return null;
            }

            // Generate a secure room code
            let roomCode;
            let attempts = 0;
            const maxAttempts = 10;

            do {
                roomCode = this.generateSecureRoomCode();
                attempts++;

                if (attempts >= maxAttempts) {
                    this.logger.error(`Failed to generate unique room code after ${maxAttempts} attempts`);
                    return null;
                }
            } while (this.rooms.has(roomCode));

            // Create owner as first user with properly sanitized username
            const owner = new User(ownerId, ownerName, ip);

            // Create the room with provided options
            const roomOptions = {
                maxUsers: options.maxUsers || 50,
                maxMessages: options.maxMessages || 200,
                isPrivate: options.isPrivate || false
            };

            const room = new Room(roomCode, owner, roomOptions);
            this.rooms.set(roomCode, room);

            // Track room creation for this IP
            this.incrementRoomCounter(ipHash);

            // Update memory stats
            this.memoryStats.roomCount = this.rooms.size;
            this.memoryStats.userCount += 1;

            // Emit event for monitoring
            this.emit('roomCreated', { roomCode, ownerHash: this.hashIdentifier(ownerId) });

            // this.logger.info(`Room created: ${roomCode} by ${owner.username} (${this.hashIdentifier(ownerId)})`);
            return room;
        } catch (error) {
            this.logger.error(`Failed to create room: ${error.message}`);
            return null;
        }
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
     * Check if IP has reached room creation limit
     * @param {string} ipHash - Hashed IP address
     * @returns {boolean} True if under limit, false if limit reached
     * @private
     */
    checkRoomCreationLimit(ipHash) {
        const counter = this.ipRoomCounter.get(ipHash) || 0;
        return counter < this.config.maxRoomsPerIp;
    }

    /**
     * Increment room counter for an IP with improved timeout handling
     * @param {string} ipHash - Hashed IP address
     * @private
     */
    incrementRoomCounter(ipHash) {
        const currentCount = this.ipRoomCounter.get(ipHash) || 0;
        this.ipRoomCounter.set(ipHash, currentCount + 1);

        // Clear any existing timeout to prevent memory leaks
        const timeoutKey = `counter:${ipHash}`;
        if (this.timeouts.has(timeoutKey)) {
            clearTimeout(this.timeouts.get(timeoutKey));
        }

        // Set new timeout to decrement counter after 24 hours
        const timeoutId = setTimeout(() => {
            const newCount = (this.ipRoomCounter.get(ipHash) || 1) - 1;
            if (newCount <= 0) {
                this.ipRoomCounter.delete(ipHash);
            } else {
                this.ipRoomCounter.set(ipHash, newCount);
            }

            // Clean up the timeout
            this.timeouts.delete(timeoutKey);
        }, 24 * 60 * 60 * 1000); // 24 hours

        // Store timeout ID for cleanup
        this.timeouts.set(timeoutKey, timeoutId);
    }

    /**
     * Generates a cryptographically secure room code
     * @returns {string} Secure random room code
     * @private
     */
    generateSecureRoomCode() {
        return crypto.randomBytes(this.config.roomCodeLength / 2)
            .toString('hex')
            .toUpperCase();
    }

    /**
     * Adds a user to an existing room with enhanced validation
     * @param {string} roomCode - Code of the room to join
     * @param {string} userId - Socket ID of the joining user
     * @param {string} username - Username of the joining user
     * @param {string} ip - IP address of the user
     * @returns {Room|null} Room data or null if room doesn't exist or is full
     */
    joinRoom(roomCode, userId, username, ip) {
        try {
            if (!roomCode || !userId || !username || !ip) {
                this.logger.warn(`Invalid parameters for joinRoom: ${roomCode}, ${userId}, ${username}`);
                return null;
            }

            // Normalize room code for case-insensitive matching
            const normalizedCode = roomCode.toUpperCase();

            const room = this.getRoom(normalizedCode);
            if (!room) {
                this.logger.warn(`Room not found: ${normalizedCode}`);
                return null;
            }

            // Create and add the user
            const user = new User(userId, username, ip);
            const added = room.addUser(user);

            if (!added) {
                this.logger.warn(`User ${username} (${this.hashIdentifier(userId)}) could not join room ${normalizedCode}`);
                return null;
            }

            // Update memory stats
            this.memoryStats.userCount += 1;

            // Emit event for monitoring
            this.emit('userJoined', {
                roomCode,
                userHash: this.hashIdentifier(userId),
                userCount: room.users.size
            });

            this.logger.info(`User ${user.username} (${this.hashIdentifier(userId)}) joined room: ${normalizedCode}`);
            return room;
        } catch (error) {
            this.logger.error(`Failed to join room: ${error.message}`);
            return null;
        }
    }

    /**
     * Removes a user from a room with ownership transfer handling
     * @param {string} userId - Socket ID of the user leaving
     * @returns {Object|null} Room and user data or null if user not found
     * @throws {Error} If an error occurs during user removal process
     */
    leaveRoom(userId) {
        try {
            // Find which room the user is in
            for (const [roomCode, room] of this.rooms.entries()) {
                const user = room.getUser(userId);
                if (!user) continue;

                const wasOwner = room.isOwner(userId);

                // Remove user from room
                const result = room.removeUser(userId);
                if (!result) continue;

                const userData = {
                    id: userId,
                    username: result.userData.username,
                    wasOwner
                };

                // Update memory stats
                this.memoryStats.userCount = Math.max(0, this.memoryStats.userCount - 1);

                // Emit event for monitoring
                this.emit('userLeft', {
                    roomCode,
                    userHash: this.hashIdentifier(userId),
                    userCount: room.users.size
                });

                // Delete room if empty
                if (room.users.size === 0) {
                    this.deleteRoom(roomCode);
                    return { roomCode, userData, room: null, newOwnerId: null };
                }

                // Return new owner info if ownership changed
                let newOwnerId = null;
                if (wasOwner) {
                    const newOwner = room.owner;
                    if (newOwner) {
                        newOwnerId = newOwner.id;
                        this.logger.info(`New owner assigned for room ${roomCode}: ${newOwner.username} (${this.hashIdentifier(newOwnerId)})`);
                    }
                }

                this.logger.info(`User ${userData.username} (${this.hashIdentifier(userId)}) left room: ${roomCode}`);
                return {
                    roomCode,
                    userData,
                    room,
                    newOwnerId
                };
            }

            return null;
        } catch (error) {
            this.logger.error(`Error removing user ${this.hashIdentifier(userId)}: ${error.message}`);
            throw new Error(`Failed to process user leaving: ${error.message}`);
        }
    }

    /**
     * Kicks a user from a room with optional ban
     * @param {string} roomCode - Room code
     * @param {string} requesterId - ID of the user requesting the kick (must be owner)
     * @param {string} targetUsername - Username of user to kick
     * @param {boolean} ban - Whether to ban the user from rejoining
     * @returns {Object|null} Kicked user info or null if failed
     */
    kickUser(roomCode, requesterId, targetUsername, ban = false) {
        try {
            const room = this.getRoom(roomCode);
            if (!room) return null;

            // Check if requester is room owner
            if (!room.isOwner(requesterId)) {
                return null;
            }

            // Find target user by username
            const targetUser = room.getUserByUsername(targetUsername);
            if (!targetUser) return null;

            // Prevent kicking yourself
            if (targetUser.id === requesterId) {
                return null;
            }

            // Ban user if requested
            if (ban && targetUser.ipHash) {
                room.banUser(targetUser);
            }

            // Remove user
            const result = room.removeUser(targetUser.id);
            if (!result) return null;

            // Update memory stats
            this.memoryStats.userCount = Math.max(0, this.memoryStats.userCount - 1);

            // Emit event for monitoring
            this.emit('userKicked', {
                roomCode,
                userHash: this.hashIdentifier(targetUser.id),
                requestedByHash: this.hashIdentifier(requesterId)
            });

            this.logger.info(`User ${targetUsername} was kicked from room ${roomCode} by owner ${this.hashIdentifier(requesterId)}`);

            return {
                userId: targetUser.id,
                username: targetUser.username,
                banned: ban
            };
        } catch (error) {
            this.logger.error(`Error kicking user ${targetUsername}: ${error.message}`);
            return null;
        }
    }

    /**
     * Checks if a username is already taken in a room
     * @param {string} roomCode - Code of the room
     * @param {string} username - Username to check
     * @returns {boolean} True if username is taken, false otherwise
     */
    isUsernameTaken(roomCode, username) {
        const room = this.getRoom(roomCode);
        if (!room) return false;

        // Sanitize username for consistent comparison
        const sanitizedUsername = SecurityUtils.sanitizeText(username, SecurityUtils.SIZE_LIMITS.USERNAME);
        if (!sanitizedUsername) return false;

        for (const user of room.users.values()) {
            if (user.username.toLowerCase() === sanitizedUsername.toLowerCase()) {
                return true;
            }
        }

        return false;
    }

    /**
     * Adds a user message to a room with enhanced validation
     * @param {string} roomCode - Code of the room
     * @param {string} userId - Socket ID of the sender
     * @param {string} text - Message content
     * @returns {Message|null} The created message or null if room/user doesn't exist
     */
    addMessage(roomCode, userId, text) {
        try {
            const room = this.getRoom(roomCode);
            if (!room) return null;

            const user = room.getUser(userId);
            if (!user) return null;

            // Generate a unique message ID that includes sender ID for traceability
            const messageId = `${userId}-${crypto.randomUUID()}`;

            // Create message with validation
            const message = new Message(messageId, user.username, text);

            // Add to room with rate limiting
            const added = room.addMessage(message);
            if (!added) {
                this.logger.warn(`Message from ${user.username} rate limited in room ${roomCode}`);
                return null;
            }

            // Update user activity
            user.updateActivity();

            // Update memory stats
            this.memoryStats.messageCount += 1;

            // Emit event for monitoring
            this.emit('messageAdded', {
                roomCode,
                userHash: this.hashIdentifier(userId),
                messageCount: room.messages.length
            });

            return message;
        } catch (error) {
            this.logger.warn(`Failed to add message to room ${roomCode}: ${error.message}`);
            return null;
        }
    }

    /**
     * Adds a system message to a room
     * @param {string} roomCode - Code of the room
     * @param {string} text - System message content
     * @returns {Message|null} The created message or null if room doesn't exist
     */
    addSystemMessage(roomCode, text) {
        try {
            const room = this.getRoom(roomCode);
            if (!room) return null;

            // Sanitize even system messages
            const sanitizedText = SecurityUtils.sanitizeText(text, SecurityUtils.SIZE_LIMITS.MESSAGE);

            // Generate a secure unique ID for the message
            const messageId = 'system-' + crypto.randomUUID();

            const message = new Message(messageId, 'System', sanitizedText);

            // Add to room (bypass rate limiting for system messages)
            room.addMessage(message, true);

            // Update memory stats
            this.memoryStats.messageCount += 1;

            return message;
        } catch (error) {
            this.logger.warn(`Failed to add system message to room ${roomCode}: ${error.message}`);
            return null;
        }
    }

    /**
     * Deletes a room and all associated data
     * @param {string} roomCode - Code of the room to delete
     * @returns {boolean} True if room was deleted, false if it didn't exist
     */
    deleteRoom(roomCode) {
        try {
            if (!roomCode) return false;

            const normalizedCode = roomCode.toUpperCase();
            if (!this.rooms.has(normalizedCode)) return false;

            const room = this.rooms.get(normalizedCode);

            // Update memory stats
            this.memoryStats.roomCount = this.rooms.size - 1;
            this.memoryStats.userCount = Math.max(0, this.memoryStats.userCount - room.users.size);
            this.memoryStats.messageCount = Math.max(0, this.memoryStats.messageCount - room.messages.length);

            // Emit event for monitoring
            this.emit('roomDeleted', {
                roomCode: normalizedCode,
                userCount: room.users.size,
                messageCount: room.messages.length
            });

            this.logger.info(`Room deleted: ${normalizedCode} (had ${room.users.size} users and ${room.messages.length} messages)`);

            // Clean up all data
            this.rooms.delete(normalizedCode);

            // Return success
            return true;
        } catch (error) {
            this.logger.error(`Error deleting room ${roomCode}: ${error.message}`);
            return false;
        }
    }

    /**
     * Checks if a user is the owner of a room
     * @param {string} roomCode - Code of the room
     * @param {string} userId - Socket ID of the user
     * @returns {boolean} True if user is owner, false otherwise
     */
    isRoomOwner(roomCode, userId) {
        const room = this.getRoom(roomCode);
        if (!room) return false;

        return room.isOwner(userId);
    }

    /**
     * Gets a room by its code with case-insensitive lookup
     * @param {string} roomCode - Code of the room
     * @returns {Room} The room or null if not found
     */
    getRoom(roomCode) {
        if (!roomCode) return null;

        // Case-insensitive room code lookup
        const normalizedCode = roomCode.toUpperCase();
        return this.rooms.get(normalizedCode) || null;
    }

    /**
     * Checks if a room exists
     * @param {string} roomCode - Code of the room
     * @returns {boolean} True if room exists, false otherwise
     */
    roomExists(roomCode) {
        if (!roomCode) return false;

        const normalizedCode = roomCode.toUpperCase();
        return this.rooms.has(normalizedCode);
    }

    /**
     * Gets the total number of active rooms
     * @returns {number} Number of rooms
     */
    getRoomCount() {
        return this.rooms.size;
    }

    /**
     * Gets minimal stats about rooms (for monitoring)
     * Ensures no private data is exposed
     * @returns {Object} Room statistics
     */
    getStats() {
        const totalUsers = Array.from(this.rooms.values()).reduce(
            (sum, room) => sum + room.users.size, 0
        );

        const totalMessages = Array.from(this.rooms.values()).reduce(
            (sum, room) => sum + room.messages.length, 0
        );

        return {
            roomCount: this.rooms.size,
            userCount: totalUsers,
            messageCount: totalMessages,
            oldestRoom: this.getOldestRoomAge(),
            memoryUsageMB: this.memoryStats.memoryUsage
        };
    }

    /**
     * Gets the age in milliseconds of the oldest active room
     * @returns {number} Age in milliseconds or 0 if no rooms
     * @private
     */
    getOldestRoomAge() {
        if (this.rooms.size === 0) return 0;

        const now = Date.now();
        let oldestTime = now;

        for (const room of this.rooms.values()) {
            if (room.createdAt < oldestTime) {
                oldestTime = room.createdAt;
            }
        }

        return now - oldestTime;
    }

    /**
     * Sets up periodic cleanup of inactive rooms
     * Runs at configured interval and removes rooms inactive for configured timeout
     */
    initializeCleanupSchedule() {
        const CLEANUP_INTERVAL = this.config.cleanupInterval;
        const ROOM_EXPIRY = this.config.roomInactivityTimeout;

        // Store the interval ID for potential cleanup
        const intervalId = setInterval(() => {
            try {
                const now = Date.now();
                let deletedCount = 0;

                for (const [roomCode, room] of this.rooms.entries()) {
                    // Check if room is inactive or has explicitly expired
                    if (room.isInactive(ROOM_EXPIRY) || room.isExpired()) {
                        // Update stats before deleting
                        this.memoryStats.userCount = Math.max(0, this.memoryStats.userCount - room.users.size);
                        this.memoryStats.messageCount = Math.max(0, this.memoryStats.messageCount - room.messages.length);

                        this.rooms.delete(roomCode);
                        deletedCount++;

                        // Emit event for monitoring
                        this.emit('roomExpired', { roomCode });

                        this.logger.info(`Room ${roomCode} deleted due to inactivity (${Math.round((now - room.lastActivity) / 3600000)} hours)`);
                    }
                }

                if (deletedCount > 0) {
                    // Update room count after cleanup
                    this.memoryStats.roomCount = this.rooms.size;
                    this.logger.info(`Cleanup: Deleted ${deletedCount} inactive rooms. ${this.rooms.size} rooms remaining.`);
                }

                // Always clean up timeouts to prevent memory leaks
                this.cleanupTimeouts();

                // Clean up rate limit tracking
                this.cleanupRateLimitTracking();
            } catch (error) {
                this.logger.error(`Error during room cleanup: ${error.message}`);
            }
        }, CLEANUP_INTERVAL);

        // Store the interval ID for cleanup on shutdown
        this.timeouts.set('cleanup-interval', intervalId);

        this.logger.info('Room cleanup schedule initialized');
    }

    /**
     * Initialize memory monitoring
     * Tracks memory usage and room statistics
     */
    initializeMemoryMonitoring() {
        // Store the interval ID for potential cleanup
        const intervalId = setInterval(() => {
            try {
                const memoryUsage = process.memoryUsage();

                // Update memory stats
                this.memoryStats = {
                    lastCheck: Date.now(),
                    roomCount: this.rooms.size,
                    userCount: 0,
                    messageCount: 0,
                    memoryUsage: Math.round(memoryUsage.heapUsed / 1024 / 1024) // MB
                };

                // Count total users and messages
                for (const room of this.rooms.values()) {
                    this.memoryStats.userCount += room.users.size;
                    this.memoryStats.messageCount += room.messages.length;
                }

                // Check for potential memory issues
                const memoryThreshold = this.config.memoryWarningThreshold;
                if (this.memoryStats.memoryUsage > memoryThreshold) {
                    this.logger.warn(`High memory usage detected: ${this.memoryStats.memoryUsage}MB. Consider increasing cleanup frequency.`);

                    // Emit event for monitoring
                    this.emit('highMemoryUsage', this.memoryStats);
                }

                // Log memory usage periodically
                this.logger.debug(`Memory stats: ${JSON.stringify(this.memoryStats)}`);

            } catch (error) {
                this.logger.error(`Error during memory monitoring: ${error.message}`);
            }
        }, this.config.memoryMonitoringInterval);

        // Store the interval ID for cleanup on shutdown
        this.timeouts.set('memory-monitoring-interval', intervalId);

        this.logger.info('Memory monitoring initialized');
    }

    /**
     * Clean up all timeouts to prevent memory leaks
     */
    cleanupTimeouts() {
        const now = Date.now();
        const deletedTimeouts = [];

        for (const [key, timeoutId] of this.timeouts.entries()) {
            // Skip interval IDs which should run until shutdown
            if (key === 'cleanup-interval' || key === 'memory-monitoring-interval') {
                continue;
            }

            // Check if timeout is old (older than 24 hours + 10 minutes buffer)
            if (key.startsWith('counter:') && key.includes(':time:')) {
                const timeParts = key.split(':time:');
                if (timeParts.length === 2) {
                    const timestamp = parseInt(timeParts[1]);
                    if (now - timestamp > 24 * 60 * 60 * 1000 + 10 * 60 * 1000) {
                        clearTimeout(timeoutId);
                        deletedTimeouts.push(key);
                    }
                }
            }
        }

        // Remove deleted timeouts
        deletedTimeouts.forEach(key => this.timeouts.delete(key));

        if (deletedTimeouts.length > 0) {
            this.logger.debug(`Cleaned up ${deletedTimeouts.length} stale timeouts`);
        }
    }

    /**
     * Clean up stale rate limit tracking data
     * @private
     */
    cleanupRateLimitTracking() {
        try {
            // Clean entries with 0 or negative counts
            let cleanedEntries = 0;

            // Clean up IP room counter for IPs with 0 rooms
            for (const [ipHash, count] of this.ipRoomCounter.entries()) {
                if (count <= 0) {
                    this.ipRoomCounter.delete(ipHash);
                    cleanedEntries++;
                }
            }

            if (cleanedEntries > 0) {
                this.logger.debug(`Cleaned up ${cleanedEntries} rate limit tracking entries`);
            }
        } catch (error) {
            this.logger.error(`Error cleaning up rate limit tracking: ${error.message}`);
        }
    }

    /**
     * Emit an event for monitoring
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    emit(event, data) {
        if (this.eventEmitter) {
            this.eventEmitter.emit(event, data);
        }
    }

    /**
     * Register an event listener
     * @param {string} event - Event name
     * @param {Function} listener - Event listener
     */
    on(event, listener) {
        if (this.eventEmitter) {
            this.eventEmitter.on(event, listener);
        }
        return this;
    }

    /**
     * Remove an event listener
     * @param {string} event - Event name
     * @param {Function} listener - Event listener to remove
     */
    off(event, listener) {
        if (this.eventEmitter) {
            this.eventEmitter.off(event, listener);
        }
        return this;
    }

    /**
     * Shut down the room manager gracefully
     * Clean up all resources to prevent memory leaks
     */
    shutdown() {
        try {
            this.logger.info('Shutting down RoomManager...');

            // Clear all intervals and timeouts
            for (const [key, id] of this.timeouts.entries()) {
                if (key.includes('interval')) {
                    clearInterval(id);
                } else {
                    clearTimeout(id);
                }
            }

            // Clean up room data
            this.rooms.clear();
            this.ipRoomCounter.clear();
            this.timeouts.clear();

            this.logger.info('RoomManager shut down successfully');

            // Remove all listeners
            if (this.eventEmitter) {
                this.eventEmitter.removeAllListeners();
            }

            return true;
        } catch (error) {
            this.logger.error(`Error during RoomManager shutdown: ${error.message}`);
            return false;
        }
    }

    /**
     * Get detailed memory and performance metrics
     * Useful for monitoring and diagnostics
     * @returns {Object} Detailed metrics
     */
    getDetailedMetrics() {
        try {
            const metrics = {
                rooms: {
                    total: this.rooms.size,
                    active: 0, // Rooms with activity in last hour
                    occupancy: {} // Distribution of user counts
                },
                users: {
                    total: this.memoryStats.userCount,
                    averagePerRoom: this.rooms.size > 0 ?
                        this.memoryStats.userCount / this.rooms.size : 0
                },
                messages: {
                    total: this.memoryStats.messageCount,
                    averagePerRoom: this.rooms.size > 0 ?
                        this.memoryStats.messageCount / this.rooms.size : 0
                },
                memory: {
                    heapUsedMB: this.memoryStats.memoryUsage,
                    heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                    external: Math.round(process.memoryUsage().external / 1024 / 1024)
                },
                uptime: process.uptime()
            };

            // Calculate room activity and occupancy distribution
            const now = Date.now();
            const hourAgo = now - 3600000;

            for (const room of this.rooms.values()) {
                // Count active rooms (activity in last hour)
                if (room.lastActivity > hourAgo) {
                    metrics.rooms.active++;
                }

                // Track occupancy distribution
                const userCount = room.users.size;
                metrics.rooms.occupancy[userCount] =
                    (metrics.rooms.occupancy[userCount] || 0) + 1;
            }

            return metrics;
        } catch (error) {
            this.logger.error(`Error generating metrics: ${error.message}`);
            return { error: 'Failed to generate metrics' };
        }
    }
}

module.exports = RoomManager;