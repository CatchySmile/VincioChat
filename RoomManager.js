/**
 * Manages all chat rooms and their associated data
 */
const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');
const Message = require('../models/Message');
const User = require('../models/User');
const logger = require('../utils/logger');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    
    // Set up periodic cleanup of inactive rooms
    this.initializeCleanupSchedule();
  }
  
  /**
   * Creates a new chat room
   * @param {string} ownerId - Socket ID of the room creator
   * @param {string} ownerName - Username of the room creator
   * @returns {Room} The newly created room
   */
  createRoom(ownerId, ownerName) {
    // Generate a short but unique room code
    // Using slice(0, 6) can lead to collisions, so we implement a safer approach
    let roomCode;
    do {
      roomCode = uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();
    } while (this.rooms.has(roomCode));
    
    // Create owner as first user
    const owner = new User(ownerId, ownerName);
    
    // Create the room
    const room = new Room(roomCode, owner);
    this.rooms.set(roomCode, room);
    
    logger.info(`Room created: ${roomCode} by ${ownerName} (${ownerId})`);
    return room;
  }
  
  /**
   * Adds a user to an existing room
   * @param {string} roomCode - Code of the room to join
   * @param {string} userId - Socket ID of the joining user
   * @param {string} username - Username of the joining user
   * @returns {Object} Room data or null if room doesn't exist
   */
  joinRoom(roomCode, userId, username) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    
    const user = new User(userId, username);
    room.addUser(user);
    room.lastActivity = Date.now();
    
    logger.info(`User ${username} (${userId}) joined room: ${roomCode}`);
    return room;
  }
  
  /**
   * Removes a user from a room
   * @param {string} userId - Socket ID of the user leaving
   * @returns {Object} Room and user data or null if user not found
   */
  leaveRoom(userId) {
    // Find which room the user is in
    for (const [roomCode, room] of this.rooms.entries()) {
      const user = room.getUser(userId);
      if (user) {
        const wasOwner = room.isOwner(userId);
        const userData = { 
          id: userId, 
          username: user.username,
          wasOwner
        };
        
        // Remove user from room
        room.removeUser(userId);
        room.lastActivity = Date.now();
        
        // If this was the owner, assign a new one if possible
        let newOwnerId = null;
        if (wasOwner && room.users.size > 0) {
          const newOwner = Array.from(room.users.values())[0];
          room.owner = newOwner;
          newOwnerId = newOwner.id;
          logger.info(`New owner assigned for room ${roomCode}: ${newOwner.username} (${newOwnerId})`);
        }
        
        // Delete room if empty
        if (room.users.size === 0) {
          this.deleteRoom(roomCode);
          return { roomCode, userData, room: null, newOwnerId };
        }
        
        logger.info(`User ${userData.username} (${userId}) left room: ${roomCode}`);
        return { 
          roomCode, 
          userData,
          room,
          newOwnerId
        };
      }
    }
    
    return null;
  }
  
  /**
   * Adds a message to a room
   * @param {string} roomCode - Code of the room
   * @param {string} userId - Socket ID of the sender
   * @param {string} text - Message content
   * @returns {Message} The created message or null if room/user doesn't exist
   */
  addMessage(roomCode, userId, text) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    
    const user = room.getUser(userId);
    if (!user) return null;
    
    const message = new Message(uuidv4(), user.username, text);
    room.addMessage(message);
    room.lastActivity = Date.now();
    
    return message;
  }
  
  /**
   * Adds a system message to a room
   * @param {string} roomCode - Code of the room
   * @param {string} text - System message content
   * @returns {Message} The created message or null if room doesn't exist
   */
  addSystemMessage(roomCode, text) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    
    const message = new Message(uuidv4(), 'System', text);
    room.addMessage(message);
    room.lastActivity = Date.now();
    
    return message;
  }
  
  /**
   * Deletes a room
   * @param {string} roomCode - Code of the room to delete
   * @returns {boolean} True if room was deleted, false if it didn't exist
   */
  deleteRoom(roomCode) {
    if (!this.rooms.has(roomCode)) return false;
    
    const room = this.rooms.get(roomCode);
    logger.info(`Room deleted: ${roomCode} (had ${room.users.size} users and ${room.messages.length} messages)`);
    
    this.rooms.delete(roomCode);
    return true;
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
   * Gets a room by its code
   * @param {string} roomCode - Code of the room
   * @returns {Room} The room or null if not found
   */
  getRoom(roomCode) {
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
   * Sets up periodic cleanup of inactive rooms
   * Runs every hour and removes rooms inactive for more than 1 hour
   */
  initializeCleanupSchedule() {
    const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
    const ROOM_EXPIRY = 1 * 60 * 60 * 1000; // 1 hours
    
    setInterval(() => {
      const now = Date.now();
      let deletedCount = 0;
      
      for (const [roomCode, room] of this.rooms.entries()) {
        const inactiveTime = now - room.lastActivity;
        
        if (inactiveTime > ROOM_EXPIRY) {
          this.rooms.delete(roomCode);
          deletedCount++;
          logger.info(`Room ${roomCode} deleted due to inactivity (${Math.round(inactiveTime / 3600000)} hours)`);
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`Cleanup: Deleted ${deletedCount} inactive rooms. ${this.rooms.size} rooms remaining.`);
      }
    }, CLEANUP_INTERVAL);
    
    logger.info('Room cleanup schedule initialized');
  }
}

module.exports = RoomManager;