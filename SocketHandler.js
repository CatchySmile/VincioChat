/**
 * Handles all Socket.IO events and communication with enhanced security, error handling,
 * and memory management integration.
 */
const SecurityUtils = require('./utils/SecurityUtils');

class SocketHandler {
    /**
     * Creates a new SocketHandler
     * @param {Object} io - Socket.IO server instance
     * @param {Object} roomManager - Room manager instance
     * @param {Object} logger - Logger utility
     * @param {Object} options - Configuration options
     */
    constructor(io, roomManager, logger, options = {}) {
        this.io = io;
        this.roomManager = roomManager;
        this.logger = logger;

        // Track user details by socket ID with last activity timestamp
        this.userSockets = new Map();

        // Memory monitor reference
        this.memoryMonitor = options.memoryMonitor || null;

        // Set up periodic cleanup for memory management
        this.setupCleanupSchedule();

        // Register handlers for process signals (graceful shutdown)
        this.setupProcessSignalHandlers();
    }

    /**
     * Sets up process signal handlers for graceful shutdown
     * @private
     */
    setupProcessSignalHandlers() {
        // Only set up handlers once
        if (global._socketHandlerSignalsRegistered) return;

        // Handle graceful shutdown
        process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
        process.on('SIGINT', () => this.handleShutdown('SIGINT'));

        // Mark as registered to prevent duplicate handlers
        global._socketHandlerSignalsRegistered = true;
    }

    /**
     * Handle application shutdown gracefully
     * @param {string} signal - Signal that triggered shutdown
     * @private
     */
    async handleShutdown(signal) {
        this.logger.info(`${signal} received, initiating graceful shutdown...`);

        try {
            // Notify all users
            for (const [socketId, userData] of this.userSockets.entries()) {
                // Only notify users in rooms
                if (userData.roomCode) {
                    const socket = this.io.sockets.sockets.get(socketId);
                    if (socket) {
                        socket.emit('error', 'Server is shutting down. Please reconnect in a moment.');
                    }
                }
            }

            // Shutdown room manager
            if (this.roomManager) {
                await this.roomManager.shutdown(true);
            }

            // Close all socket connections
            const sockets = await this.io.fetchSockets();
            for (const socket of sockets) {
                socket.disconnect(true);
            }

            this.logger.info('Graceful shutdown complete');
        } catch (error) {
            this.logger.error(`Error during shutdown: ${error.message}`);
        }
    }

    /**
     * Sets up periodic cleanup of inactive resources
     */
    setupCleanupSchedule() {
        // Clean up inactive sockets every hour
        const cleanupIntervalId = setInterval(() => this.cleanupInactiveSockets(), 3600000);

        this.logger.info('Socket cleanup schedule initialized');

        // Store interval ID for cleanup
        if (!global._cleanupIntervals) {
            global._cleanupIntervals = [];
        }
        global._cleanupIntervals.push(cleanupIntervalId);
    }

    /**
     * Cleans up inactive socket entries
     */
    cleanupInactiveSockets() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [socketId, userData] of this.userSockets.entries()) {
            // Check if socket data is stale (inactive for 2+ hours)
            if (!userData.lastActivity ||
                now - userData.lastActivity > SecurityUtils.TIMEOUTS.SOCKET_INACTIVITY) {
                // Check if socket is still connected
                const socket = this.io.sockets.sockets.get(socketId);
                if (!socket || !socket.connected) {
                    this.userSockets.delete(socketId);
                    cleanedCount++;
                }
            }
        }

        if (cleanedCount > 0) {
            this.logger.info(`Cleaned up ${cleanedCount} inactive socket entries`);
        }
    }

    /**
     * Gets client IP address from socket handshake
     * @param {Object} socket - Socket.IO socket
     * @returns {string} Client IP address
     */
    getClientIp(socket) {
        // Get IP address from socket handshake
        return socket.handshake.headers['x-forwarded-for'] ||
            socket.handshake.address ||
            'unknown';
    }

    /**
     * Initializes socket connection handling
     */
    initialize() {
        this.io.on('connection', (socket) => {
            try {
                const clientIp = this.getClientIp(socket);

                // Check connection rate limit
                if (SecurityUtils.isRateLimited(clientIp, 'connections')) {
                    this.logger.warn(`Rate limit exceeded for connections from IP: ${clientIp}`);
                    socket.emit('error', 'Too many connection attempts. Please try again later.');
                    socket.disconnect(true);
                    return;
                }

                this.logger.info(`New client connected: ${socket.id}`);

                // Track this socket with activity timestamp
                this.userSockets.set(socket.id, {
                    id: socket.id,
                    roomCode: null,
                    username: null,
                    ip: clientIp,
                    lastActivity: Date.now(),
                    sessionToken: null,
                    csrfToken: null
                });

                // Set up event handlers for this socket
                this.setupEventHandlers(socket);
            } catch (error) {
                this.logger.error(`Error handling connection: ${error.message}`);
                socket.disconnect(true);
            }
        });
    }

    /**
     * Sets up all event handlers for a socket
     * @param {Object} socket - Socket.IO socket instance
     */
    setupEventHandlers(socket) {
        // Create Room
        socket.on('createRoom', (username) => this.handleCreateRoom(socket, username));

        // Join Room
        socket.on('joinRoom', (data) => this.handleJoinRoom(socket, data));

        // Send Message
        socket.on('sendMessage', (data) => this.handleSendMessage(socket, data));

        // Delete Room
        socket.on('deleteRoom', (data) => this.handleDeleteRoom(socket, data));

        // Leave Room (explicit)
        socket.on('leaveRoom', (roomCode) => this.handleLeaveRoom(socket, roomCode));

        // Disconnect
        socket.on('disconnect', () => this.handleDisconnect(socket));

        // Kick User
        socket.on('kickUser', (data) => this.handleKickUser(socket, data));

        // Error handling
        socket.on('error', (error) => {
            this.logger.error(`Socket error for ${socket.id}: ${error}`);
        });
    }

    /**
     * Check memory status and take action if needed
     * @returns {boolean} True if memory is low
     * @private
     */
    checkMemoryStatus() {
        // If we don't have a memory monitor, assume everything is fine
        if (!this.memoryMonitor) {
            return false;
        }

        // Check if memory is low
        const isLow = this.memoryMonitor.memoryStatus !== 'normal';

        // If memory is low, perform cleanup
        if (isLow && this.roomManager) {
            // Perform cleanup based on memory status
            const cleanedRooms = this.roomManager.handleLowMemory();
            this.logger.warn(`Low memory detected. Cleaned ${cleanedRooms} rooms.`);
        }

        return isLow;
    }

    /**
 * Handles room creation with proper error handling
 * @param {Object} socket - Socket.IO socket instance
 * @param {string} username - Username of the room creator
 */
    handleCreateRoom(socket, username) {
        try {
            const clientIp = this.getClientIp(socket);

            // Check room creation rate limit
            if (SecurityUtils.isRateLimited(clientIp, 'rooms')) {
                this.logger.warn(`Rate limit exceeded for room creation from IP: ${clientIp}`);
                socket.emit('error', 'You are creating rooms too quickly. Please try again later.');
                return;
            }

            // Validate username
            if (!SecurityUtils.isValidUsername(username)) {
                socket.emit('error', 'Invalid username. Username must be between 1-20 characters and contain only letters, numbers, and underscores.');
                return;
            }

            // Check memory status before creating new room
            const isMemoryLow = this.checkMemoryStatus();
            if (isMemoryLow) {
                this.logger.warn(`Memory pressure detected during room creation attempt by ${socket.id}`);
            }

            // Create the room with client IP for the user
            const room = this.roomManager.createRoom(socket.id, username, clientIp);
            if (!room) {
                socket.emit('error', 'Failed to create room. Server may be at capacity');
                return;
            }

            // Generate session token for authentication
            const sessionToken = SecurityUtils.generateSessionToken(socket.id, room.code);

            // Generate CSRF token for form submissions
            const csrfToken = SecurityUtils.generateCSRFToken(socket.id);

            // Update user tracking with security tokens
            const userData = {
                id: socket.id,
                roomCode: room.code,
                username: username,
                ip: clientIp,
                lastActivity: Date.now(),
                sessionToken: sessionToken,
                csrfToken: csrfToken
            };

            this.userSockets.set(socket.id, userData);

            // Join the socket to the room
            socket.join(room.code);

            // Send room data and security tokens back to the client
            socket.emit('roomCreated', {
                roomCode: room.code,
                users: Array.from(room.users.values()).map(u => u.toJSON().username),
                messageSizeLimit: SecurityUtils.SIZE_LIMITS.MESSAGE,
                sessionToken: sessionToken,
                csrfToken: csrfToken
            });

            this.logger.info(`Room created: ${room.code} by ${username} (${socket.id})`);
        } catch (error) {
            this.logger.error(`Error creating room: ${error.message}`);
            socket.emit('error', 'Failed to create room. Please try again.');
        }
    }


    /**
     * Handles joining an existing room with proper error handling
     * @param {Object} socket - Socket.IO socket instance
     * @param {Object} data - Join data (roomCode, username)
     */
    handleJoinRoom(socket, data) {
        try {
            const { roomCode, username } = data;
            const clientIp = this.getClientIp(socket);

            // Basic input validation
            if (!roomCode || !username) {
                return socket.emit('error', 'Room code and username are required');
            }

            if (!SecurityUtils.isValidRoomCode(roomCode)) {
                return socket.emit('error', 'Invalid room code format');
            }

            if (!SecurityUtils.isValidUsername(username)) {
                return socket.emit('error', 'Invalid username. Username must be between 1-20 characters and contain only letters, numbers, and underscores.');
            }

            // Check if username is already taken in this room
            if (this.roomManager.isUsernameTaken(roomCode, username)) {
                return socket.emit('error', 'Username already taken in this room');
            }

            // Try to join the room
            const room = this.roomManager.joinRoom(roomCode, socket.id, username, clientIp);
            if (!room) {
                return socket.emit('error', 'Room not found or room is full');
            }

            // Generate session token for authentication
            const sessionToken = SecurityUtils.generateSessionToken(socket.id, room.code);

            // Generate CSRF token for form submissions
            const csrfToken = SecurityUtils.generateCSRFToken(socket.id);

            // Update user tracking with security tokens
            const userData = {
                id: socket.id,
                roomCode: room.code,
                username: username,
                ip: clientIp,
                lastActivity: Date.now(),
                sessionToken: sessionToken,
                csrfToken: csrfToken
            };

            this.userSockets.set(socket.id, userData);

            // Join the socket to the room
            socket.join(room.code);

            // Broadcast the join message to everyone in the room except the sender
            const joinMessage = this.roomManager.addSystemMessage(room.code, `${username} joined the room.`);
            if (joinMessage) {
                socket.to(room.code).emit('newMessage', joinMessage); // Send to everyone except the sender
            }

            // Notify the newest user with a system message of current room occupants
            const occupants = Array.from(room.users.values())
                .map(user => user.username.slice(0, 10)) // Truncate usernames to 10 characters
                .join(', ');

            const occupantMessage = `Current occupants: ${occupants}`;
            socket.emit('newMessage', { type: 'system', text: occupantMessage });

            // Send room data and security tokens back to the client
            socket.emit('roomJoined', {
                roomCode: room.code,
                users: Array.from(room.users.values()).map(u => u.toJSON().username),
                messages: room.getRecentMessages(50).filter(msg => msg.text !== `${username} joined the room.`), // Exclude the join message
                messageSizeLimit: SecurityUtils.SIZE_LIMITS.MESSAGE,
                sessionToken: sessionToken,
                csrfToken: csrfToken,
                isRoomOwner: room.isOwner(socket.id)
            });

            // Notify other users in the room about the new user
            socket.to(room.code).emit('userJoined', {
                username: username,
                users: Array.from(room.users.values()).map(u => u.toJSON().username)
            });

            this.logger.info(`User ${username} (${socket.id}) joined room: ${room.code}`);
        } catch (error) {
            this.logger.error(`Error joining room: ${error.message}`);
            socket.emit('error', 'Failed to join room. Please try again.');
        }
    }



    /**
     * Handles sending a message with proper authentication and error handling
     * @param {Object} socket - Socket.IO socket instance
     * @param {Object} data - Message data (roomCode, message, sessionToken)
     */
    handleSendMessage(socket, data) {
        try {
            const { roomCode, message, sessionToken } = data;
            const clientIp = this.getClientIp(socket);

            // Validate session token for authenticated action
            if (!sessionToken || !SecurityUtils.validateSessionToken(sessionToken, socket.id, roomCode)) {
                this.logger.warn(`Invalid session token from ${socket.id} for room ${roomCode}`);
                return socket.emit('error', 'Invalid session. Please rejoin the room.');
            }

            // Check message rate limit
            if (SecurityUtils.isRateLimited(clientIp, 'messages')) {
                this.logger.warn(`Rate limit exceeded for messages from IP: ${clientIp}`);
                socket.emit('error', 'You are sending messages too quickly. Please slow down.');
                return;
            }

            // Validate inputs
            if (!roomCode || !message) {
                return socket.emit('error', 'Room code and message are required');
            }

            if (!SecurityUtils.isValidRoomCode(roomCode)) {
                return socket.emit('error', 'Invalid room code format');
            }

            if (!SecurityUtils.isValidMessage(message)) {
                return socket.emit('error', `Invalid message format or empty message`);
            }

            // Check if message exceeds size limit
            if (message.length > SecurityUtils.SIZE_LIMITS.MESSAGE) {
                return socket.emit('error', `Message exceeds maximum length of ${SecurityUtils.SIZE_LIMITS.MESSAGE} characters`);
            }

            // Check if user is in this room
            const userData = this.userSockets.get(socket.id);
            if (!userData || userData.roomCode !== roomCode) {
                return socket.emit('error', 'You are not in this room');
            }

            // Update last activity timestamp for session management
            userData.lastActivity = Date.now();

            // Add the message to the room
            const messageObj = this.roomManager.addMessage(roomCode, socket.id, message);
            if (!messageObj) {
                return socket.emit('error', 'Failed to send message');
            }

            // Broadcast sanitized message to all users in the room
            this.io.to(roomCode).emit('newMessage', messageObj);
        } catch (error) {
            this.logger.error(`Error sending message: ${error.message}`);
            socket.emit('error', 'Failed to send message. Please try again.');
        }
    }

    /**
     * Handles room deletion with proper authorization, CSRF protection, and error handling
     * @param {Object} socket - Socket.IO socket instance
     * @param {Object} data - Room data (roomCode, csrfToken)
     */
    handleDeleteRoom(socket, data) {
        try {
            const { roomCode, csrfToken } = data;

            // Basic input validation
            if (!SecurityUtils.isValidRoomCode(roomCode)) {
                return socket.emit('error', 'Invalid room code format');
            }

            // Validate CSRF and room membership
            if (!this.validateAction(socket.id, roomCode, csrfToken)) {
                return socket.emit('error', 'Invalid security token or room access');
            }

            // Check if room exists
            if (!this.roomManager.roomExists(roomCode)) {
                return socket.emit('error', 'Room not found');
            }

            // Check if user is the room owner
            if (!this.roomManager.isRoomOwner(roomCode, socket.id)) {
                this.logger.warn(`Unauthorized deletion attempt for room ${roomCode} by ${socket.id}`);
                return socket.emit('error', 'Only the room owner can delete the room');
            }

            // Update user activity timestamp
            const userData = this.userSockets.get(socket.id);
            if (userData) {
                userData.lastActivity = Date.now();
            }

            // Audit log the action
            this.logger.info(`Room ${roomCode} deletion requested by ${socket.id}`);

            // Notify all users in the room
            this.io.to(roomCode).emit('roomDeleted', { roomCode });

            // Remove all sockets from the room
            this.io.in(roomCode).socketsLeave(roomCode);

            // Update user tracking for all users in this room
            for (const [socketId, userData] of this.userSockets.entries()) {
                if (userData.roomCode === roomCode) {
                    userData.roomCode = null;
                    userData.sessionToken = null;
                    userData.csrfToken = null;
                }
            }

            // Delete the room
            this.roomManager.deleteRoom(roomCode);
        } catch (error) {
            this.logger.error(`Error deleting room: ${error.message}`);
            socket.emit('error', 'Failed to delete room. Please try again.');
        }
    }

    /**
     * Updated handleKickUser method that works with username instead of socket ID
     * with proper error handling
     * @param {Object} socket - Socket.IO socket instance
     * @param {Object} data - Kick data (roomCode, userToKickUsername, csrfToken)
     */
    handleKickUser(socket, data) {
        try {
            const { roomCode, userToKickUsername, csrfToken } = data;

            // Validate CSRF token to prevent CSRF attacks
            if (!csrfToken || !this.validateCSRFToken(socket.id, csrfToken)) {
                this.logger.warn(`Invalid CSRF token from ${socket.id} for kick action in room ${roomCode}`);
                return socket.emit('error', 'Invalid security token');
            }

            // Validate inputs
            if (!roomCode || !userToKickUsername) {
                return socket.emit('error', 'Room code and username are required');
            }

            if (!SecurityUtils.isValidRoomCode(roomCode)) {
                return socket.emit('error', 'Invalid room code format');
            }

            // Check if room exists
            if (!this.roomManager.roomExists(roomCode)) {
                return socket.emit('error', 'Room not found');
            }

            // Check if user is the room owner (only owners can kick)
            if (!this.roomManager.isRoomOwner(roomCode, socket.id)) {
                this.logger.warn(`Unauthorized kick attempt for room ${roomCode} by ${socket.id}`);
                return socket.emit('error', 'Only the room owner can kick users');
            }

            // Get the room
            const room = this.roomManager.getRoom(roomCode);

            // Find the user to kick by username
            let userToKickId = null;
            let kickedUsername = null;

            for (const [userId, user] of room.users.entries()) {
                if (user.username === userToKickUsername) {
                    userToKickId = userId;
                    kickedUsername = user.username;
                    break;
                }
            }

            if (!userToKickId) {
                return socket.emit('error', 'User not found in room');
            }

            // Get the socket for the kicked user
            const kickedSocket = this.io.sockets.sockets.get(userToKickId);

            // Remove user from room
            room.removeUser(userToKickId);

            // Update user tracking for kicked user
            const kickedUserData = this.userSockets.get(userToKickId);
            if (kickedUserData) {
                kickedUserData.roomCode = null;
                kickedUserData.sessionToken = null;
                kickedUserData.csrfToken = null;
                kickedUserData.lastActivity = Date.now();
            }

            // Make the kicked user's socket leave the room
            if (kickedSocket) {
                kickedSocket.leave(roomCode);
                kickedSocket.emit('kickedFromRoom', { roomCode });
            }

            // Notify remaining users about the kick
            this.io.to(roomCode).emit('userLeft', {
                username: kickedUsername,
                users: Array.from(room.users.values()).map(u => u.toJSON().username)
            });

            // Send success confirmation to the room owner
            socket.emit('userKicked', { username: kickedUsername });

            this.logger.info(`User ${kickedUsername} (${userToKickId}) was kicked from room ${roomCode} by ${socket.id}`);
        } catch (error) {
            this.logger.error(`Error kicking user: ${error.message}`);
            socket.emit('error', 'Failed to kick user. Please try again.');
        }
    }

    /**
     * Handles a user explicitly leaving a room with proper error handling
     * @param {Object} socket - Socket.IO socket instance
     * @param {string} roomCode - Code of the room to leave
     */
    handleLeaveRoom(socket, roomCode) {
        try {
            // Validate room code
            if (!SecurityUtils.isValidRoomCode(roomCode)) {
                return socket.emit('error', 'Invalid room code format');
            }

            const userData = this.userSockets.get(socket.id);
            if (!userData || userData.roomCode !== roomCode) {
                return;
            }

            // Store the username before leaving the room
            const username = userData.username;

            // Process user leaving
            const result = this.roomManager.leaveRoom(socket.id);
            if (!result) return;

            // Update user tracking
            userData.roomCode = null;
            userData.sessionToken = null;
            userData.csrfToken = null;
            userData.lastActivity = Date.now();

            // Leave the socket room
            socket.leave(roomCode);

            // If room still exists, send leave system message and notify remaining users
            if (this.roomManager.roomExists(roomCode)) {
                const room = this.roomManager.getRoom(roomCode);

                // Create and send leave system message
                const leaveMessage = this.roomManager.addSystemMessage(roomCode, `${username} left the room.`);
                if (leaveMessage) {
                    this.io.to(roomCode).emit('newMessage', leaveMessage);
                }

                // Notify about user leaving and potential ownership changes
                this.io.to(roomCode).emit('userLeft', {
                    username: username,
                    users: Array.from(room.users.values()).map(u => u.toJSON().username),
                    newOwner: result.newOwnerId
                });
            }

            this.logger.info(`User ${username} (${socket.id}) left room: ${roomCode}`);
        } catch (error) {
            this.logger.error(`Error leaving room: ${error.message}`);
            socket.emit('error', 'Failed to leave room properly. Please refresh the page.');
        }
    }

    /**
     * Handles disconnection of a socket with proper error handling
     * @param {Object} socket - Socket.IO socket instance
     */
    handleDisconnect(socket) {
        try {
            const userData = this.userSockets.get(socket.id);
            if (!userData) return;

            // If user was in a room, handle leaving
            if (userData.roomCode) {
                // Store username before processing leave
                const username = userData.username;
                const roomCode = userData.roomCode;

                const result = this.roomManager.leaveRoom(socket.id);
                if (result && this.roomManager.roomExists(result.roomCode)) {
                    // Notify remaining users
                    this.io.to(result.roomCode).emit('userLeft', {
                        username: username,
                        users: Array.from(result.room.users.values()).map(u => u.toJSON().username),
                        newOwner: result.newOwnerId
                    });
                }
            }

            // Remove from user tracking
            this.userSockets.delete(socket.id);

            this.logger.info(`Client disconnected: ${socket.id}`);
        } catch (error) {
            this.logger.error(`Error handling disconnect: ${error.message}`);
        }
    }

    /**
     * Enhanced CSRF token validation with timing-safe comparison
     * @param {string} socketId - Socket ID to validate against
     * @param {string} token - Token to validate
     * @returns {boolean} True if valid, false otherwise
     */
    validateCSRFToken(socketId, token) {
        try {
            const userData = this.userSockets.get(socketId);
            if (!userData || !userData.csrfToken || !token) return false;

            // Use timing-safe comparison to prevent timing attacks
            return SecurityUtils.timingSafeEqual(userData.csrfToken, token);
        } catch (error) {
            this.logger.error(`CSRF validation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Validates that an action is permitted with proper authentication
     * @param {string} socketId - Socket ID performing the action
     * @param {string} roomCode - Room code for the action
     * @param {string} csrfToken - CSRF token for the action
     * @returns {boolean} True if action is permitted
     */
    validateAction(socketId, roomCode, csrfToken) {
        try {
            // Validate CSRF token
            if (!this.validateCSRFToken(socketId, csrfToken)) {
                this.logger.warn(`Invalid CSRF token from ${socketId} for room ${roomCode}`);
                return false;
            }

            // Validate user is in the specified room
            const userData = this.userSockets.get(socketId);
            if (!userData || userData.roomCode !== roomCode) {
                this.logger.warn(`User ${socketId} attempted action in room ${roomCode} but is not a member`);
                return false;
            }

            return true;
        } catch (error) {
            this.logger.error(`Action validation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Get server status information
     * @returns {Object} Server stats
     */
    getServerStats() {
        try {
            const stats = {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                connections: {
                    total: this.io.engine.clientsCount,
                    trackedSockets: this.userSockets.size
                },
                rooms: this.roomManager ? this.roomManager.getStats() : null,
                memoryMonitor: this.memoryMonitor ? this.memoryMonitor.getStats() : null,
                timestamp: new Date().toISOString()
            };

            // Calculate memory usage in MB
            stats.memoryMB = {
                heapUsed: Math.round(stats.memory.heapUsed / 1024 / 1024),
                rss: Math.round(stats.memory.rss / 1024 / 1024)
            };

            return stats;
        } catch (error) {
            this.logger.error(`Error getting server stats: ${error.message}`);
            return { error: "Failed to get server stats" };
        }
    }
}

module.exports = SocketHandler;