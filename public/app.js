// Enhanced Vincio Chat with end-to-end encryption

const socket = io({
    transports: ['websocket'], // Prefer WebSocket
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000,
    secure: true, // Force secure connection
    rejectUnauthorized: true // Verify certificate
});

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const roomSelection = document.getElementById('room-selection');
const chatRoom = document.getElementById('chat-room');
const usersModal = document.getElementById('users-modal');
const adminControls = document.querySelector('.admin-controls');
const leaveConfirmModal = document.getElementById('leave-confirm-modal');
const tosModal = document.getElementById('tos-modal');
const commandModal = document.getElementById('command-help-modal');
const settingsModal = document.getElementById('settings-modal');

const usernameInput = document.getElementById('username-input');
const continueBtn = document.getElementById('continue-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const roomCodeDisplay = document.getElementById('room-code-display');
const copyRoomCodeBtn = document.getElementById('copy-room-code');
const showUsersBtn = document.getElementById('show-users-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const deleteRoomBtn = document.getElementById('delete-room-btn');
const settingsBtn = document.getElementById('settings-btn');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages');
const userList = document.getElementById('user-list');
const tosLink = document.getElementById('tos-link');

// Debug event listeners
socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    showToast('Failed to connect to server', 'error');
});

// App State
const state = {
    username: '',
    currentRoom: null,
    isRoomOwner: false,
    users: [],
    csrfToken: null,
    sessionToken: null,
    // Encryption related state
    encryptionEnabled: true,
    encryptionKey: null,
    keyAlgorithm: 'AES-GCM',
    keyFormat: 'raw'
};

// Encryption Utilities
const encryptionUtils = {
    /**
     * Generate a random encryption key
     * @returns {Promise<CryptoKey>} Generated encryption key
     */
    async generateKey() {
        try {
            return await window.crypto.subtle.generateKey(
                {
                    name: state.keyAlgorithm,
                    length: 256
                },
                true, // extractable
                ['encrypt', 'decrypt']
            );
        } catch (error) {
            console.error('Failed to generate encryption key:', error);
            showToast('Failed to enable encryption', 'error');
            throw error;
        }
    },

    /**
     * Export a CryptoKey to raw format
     * @param {CryptoKey} key - The key to export
     * @returns {Promise<string>} Base64 string of the exported key
     */
    async exportKey(key) {
        try {
            const exportedKey = await window.crypto.subtle.exportKey(
                state.keyFormat,
                key
            );
            return this._arrayBufferToBase64(exportedKey);
        } catch (error) {
            console.error('Failed to export key:', error);
            showToast('Failed to process encryption key', 'error');
            throw error;
        }
    },

    /**
     * Import a key from a base64 string
     * @param {string} keyBase64 - Base64 encoded key
     * @returns {Promise<CryptoKey>} Imported key
     */
    async importKey(keyBase64) {
        try {
            const keyData = this._base64ToArrayBuffer(keyBase64);
            return await window.crypto.subtle.importKey(
                state.keyFormat,
                keyData,
                {
                    name: state.keyAlgorithm,
                    length: 256
                },
                true, // extractable
                ['encrypt', 'decrypt']
            );
        } catch (error) {
            console.error('Failed to import key:', error);
            showToast('Failed to process encryption key', 'error');
            throw error;
        }
    },

    /**
     * Encrypt a message
     * @param {string} message - Message to encrypt
     * @param {CryptoKey} key - Encryption key
     * @returns {Promise<Object>} Encrypted message with IV
     */
    async encryptMessage(message, key) {
        try {
            // Generate a random initialization vector (IV)
            const iv = window.crypto.getRandomValues(new Uint8Array(12));

            // Encode the message as UTF-8
            const encodedMessage = new TextEncoder().encode(message);

            // Encrypt the message
            const encrypted = await window.crypto.subtle.encrypt(
                {
                    name: state.keyAlgorithm,
                    iv: iv
                },
                key,
                encodedMessage
            );

            // Return the encrypted message and IV as base64 strings
            return {
                iv: this._arrayBufferToBase64(iv),
                ciphertext: this._arrayBufferToBase64(encrypted)
            };
        } catch (error) {
            console.error('Failed to encrypt message:', error);
            showToast('Failed to encrypt message', 'error');
            throw error;
        }
    },

    /**
     * Decrypt a message
     * @param {Object} encryptedData - Encrypted message data (iv, ciphertext)
     * @param {CryptoKey} key - Decryption key
     * @returns {Promise<string>} Decrypted message text
     */
    async decryptMessage(encryptedData, key) {
        try {
            const iv = this._base64ToArrayBuffer(encryptedData.iv);
            const ciphertext = this._base64ToArrayBuffer(encryptedData.ciphertext);

            // Decrypt the message
            const decrypted = await window.crypto.subtle.decrypt(
                {
                    name: state.keyAlgorithm,
                    iv: iv
                },
                key,
                ciphertext
            );

            // Decode the decrypted message
            return new TextDecoder().decode(decrypted);
        } catch (error) {
            console.error('Failed to decrypt message:', error);
            return '[Encrypted message - unable to decrypt]';
        }
    },

    /**
     * Helper function to convert ArrayBuffer to Base64 string
     * @param {ArrayBuffer} buffer - The buffer to convert
     * @returns {string} Base64 encoded string
     */
    _arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    },

    /**
     * Helper function to convert Base64 string to ArrayBuffer
     * @param {string} base64 - Base64 encoded string
     * @returns {ArrayBuffer} Decoded ArrayBuffer
     */
    _base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    },

    /**
     * Generate a room code and embed the encryption key in it
     * @returns {Promise<Object>} Object containing room code and key
     */
    async generateSecureRoomCode() {
        // Generate a new encryption key
        const key = await this.generateKey();

        // Export the key to a base64 string
        const keyBase64 = await this.exportKey(key);

        // Generate a random room code base (16 characters)
        const roomCodeBase = Array.from(window.crypto.getRandomValues(new Uint8Array(8)))
            .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

        // Return both the room code and the key
        return {
            roomCode: roomCodeBase,
            key: keyBase64,
            cryptoKey: key
        };
    },

    /**
     * Extract the encryption key from a room code
     * @param {string} combinedCode - Room code potentially containing key
     * @returns {Promise<Object>} Object with room code and key
     */
    async parseRoomCode(combinedCode) {
        try {
            // Try to parse the room code to see if it includes a key
            if (combinedCode.includes('#')) {
                const [roomCode, keyBase64] = combinedCode.split('#');
                const key = await this.importKey(keyBase64);

                return {
                    roomCode,
                    key,
                    keyBase64
                };
            }

            // No encryption key included, return just the room code
            return {
                roomCode: combinedCode,
                key: null,
                keyBase64: null
            };
        } catch (error) {
            console.error('Failed to parse room code:', error);

            // If parsing fails, assume it's just a regular room code
            return {
                roomCode: combinedCode,
                key: null,
                keyBase64: null
            };
        }
    }
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    showToast('Welcome to Vincio Chat', 'info');

    // Pre-populate username with random identifier
    usernameInput.value = `User${Math.floor(Math.random() * 10000)}`;

    // Welcome screen - username setup
    continueBtn.addEventListener('click', handleUsernameSubmit);
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleUsernameSubmit();
    });

    // Room selection screen
    createRoomBtn.addEventListener('click', handleCreateRoom);
    joinRoomBtn.addEventListener('click', handleJoinRoom);
    roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleJoinRoom();
    });

    // Chat room screen
    copyRoomCodeBtn.addEventListener('click', handleCopyRoomCode);
    showUsersBtn.addEventListener('click', handleShowUsers);
    leaveRoomBtn.addEventListener('click', () => toggleLeaveModal(true));
    deleteRoomBtn.addEventListener('click', handleDeleteRoom);

    // Settings button
    settingsBtn.addEventListener('click', () => toggleModal(settingsModal, true));

    // Configure leave room confirmation buttons
    document.getElementById('leave-confirm-modal').querySelector('.primary-btn')
        .addEventListener('click', confirmLeaveRoom);
    document.getElementById('leave-confirm-modal').querySelector('.danger-btn')
        .addEventListener('click', () => toggleLeaveModal(false));

    // Create kick modal
    createKickConfirmModal();

    // TOS Link
    tosLink.addEventListener('click', (e) => {
        e.preventDefault();
        toggleTosModal(true);
    });

    // Close TOS button
    document.getElementById('close-tos-btn').addEventListener('click', () => toggleTosModal(false));

    // Close command help button
    document.getElementById('close-command-help-btn').addEventListener('click', () => toggleCommandHelpModal(false));

    // Close modal buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function () {
            const modal = this.closest('.modal');
            if (modal) {
                toggleModal(modal, false);
            }
        });
    });

    // Handle browser window/tab closing or refreshing
    window.addEventListener('beforeunload', () => {
        if (state.currentRoom) {
            socket.emit('leaveRoom', state.currentRoom);
        }
    });

    // Initialize message form
    messageForm.addEventListener('submit', handleMessageSubmit);

    // Check if Web Crypto API is available
    if (!window.crypto || !window.crypto.subtle) {
        showToast('Your browser doesn\'t support encryption. Please use a modern browser.', 'error');
        state.encryptionEnabled = false;
    }
});

// Event Handlers
function handleUsernameSubmit() {
    const username = usernameInput.value.trim();

    // Check if username is empty
    if (!username) {
        showToast('Please enter a username', 'error');
        return;
    }

    // Check for invalid characters or zero-width characters
    if (/[\u200B-\u200D\uFEFF]/.test(username)) {
        usernameInput.value = '';
        showToast('Username contains invalid characters', 'error');
        return;
    }

    // Check for excessive whitespace
    if (username.split(/\s+/).length > 5) {
        usernameInput.value = '';
        showToast('Username contains excessive whitespace', 'error');
        return;
    }

    // Check if username length exceeds 20 characters
    if (username.length > 20) {
        usernameInput.value = '';
        showToast('Username cannot exceed 20 characters', 'error');
        return;
    }

    // Check if username has special characters 
    if (/[^a-zA-Z0-9_]/.test(username)) {
        usernameInput.value = '';
        showToast('Username can only contain letters, numbers, and underscores', 'error');
        return;
    }

    // Store sanitized username
    state.username = username;
    navigateTo('room-selection');
}

async function handleCreateRoom() {
    try {
        // Generate a room code and encryption key
        const { roomCode, key, cryptoKey } = await encryptionUtils.generateSecureRoomCode();

        // Store the encryption key in state
        state.encryptionKey = cryptoKey;

        // Create the room
        socket.emit('createRoom', state.username);
        showToast('Creating encrypted room...', 'info');
    } catch (error) {
        console.error('Failed to create room:', error);
        showToast('Failed to create encrypted room', 'error');
    }
}

async function handleJoinRoom() {
    const roomCodeInput = document.getElementById('room-code-input');
    const inputValue = roomCodeInput.value.trim();

    // Check if room code is empty
    if (!inputValue) {
        showToast('Please enter a room code', 'error');
        return;
    }

    // Check for invalid characters or zero-width characters
    if (/[\u200B-\u200D\uFEFF]/.test(inputValue)) {
        roomCodeInput.value = '';
        showToast('Room code contains invalid characters', 'error');
        return;
    }

    try {
        // Parse the room code to extract the encryption key if present
        const { roomCode, key } = await encryptionUtils.parseRoomCode(inputValue);

        // Store the encryption key if available
        if (key) {
            state.encryptionKey = key;
            showToast('Joining encrypted room...', 'info');
        } else {
            state.encryptionKey = null;
            showToast('Joining room without encryption...', 'info');
        }

        // Join the room
        socket.emit('joinRoom', { roomCode, username: state.username });
    } catch (error) {
        console.error('Failed to join room:', error);
        showToast('Failed to join room', 'error');
    }
}

async function handleCopyRoomCode() {
    if (!state.currentRoom) {
        showToast('No room code to copy', 'error');
        return;
    }

    try {
        // If we have an encryption key, create a combined code
        let codeToCopy = state.currentRoom;

        if (state.encryptionKey) {
            // Export the key to share
            const exportedKey = await encryptionUtils.exportKey(state.encryptionKey);
            codeToCopy = `${state.currentRoom}#${exportedKey}`;
        }

        await navigator.clipboard.writeText(codeToCopy);

        if (state.encryptionKey) {
            showToast('Encrypted room code copied to clipboard', 'success');
        } else {
            showToast('Room code copied to clipboard', 'success');
        }
    } catch (error) {
        console.error('Failed to copy room code:', error);
        showToast('Failed to copy room code', 'error');
    }
}

function handleShowUsers() {
    updateUsersList();
    toggleModal(usersModal, true);
}

function toggleLeaveModal(show) {
    toggleModal(leaveConfirmModal, show);
}

function toggleTosModal(show) {
    toggleModal(tosModal, show);
}

function toggleCommandHelpModal(show) {
    toggleModal(commandModal, show);
}

function confirmLeaveRoom() {
    toggleModal(leaveConfirmModal, false);
    leaveRoom();
}

function leaveRoom() {
    if (state.currentRoom) {
        socket.emit('leaveRoom', state.currentRoom);
        state.currentRoom = null;
        state.isRoomOwner = false;
        state.sessionToken = null;
        state.csrfToken = null;
        state.encryptionKey = null;

        // Clear chat history
        messagesContainer.innerHTML = '';
        roomCodeDisplay.textContent = '';
        state.users = [];
        userList.innerHTML = '';

        // Navigate back to room selection
        navigateTo('room-selection');
        showToast('You have left the room', 'info');
    }
}

function handleDeleteRoom() {
    if (state.isRoomOwner && state.currentRoom && state.csrfToken) {
        socket.emit('deleteRoom', {
            roomCode: state.currentRoom,
            csrfToken: state.csrfToken
        });

        toggleModal(usersModal, false);
    } else {
        showToast('Only the room owner can delete the room', 'error');
    }
}

// Message handling
let lastMessageTime = 0;
let isCooldown = false;
let cooldownTimeout = null;

async function handleMessageSubmit(event) {
    event.preventDefault();

    const messageText = messageInput.value.trim();
    const currentTime = Date.now();

    // Check if cooldown period has passed (250ms)
    if (currentTime - lastMessageTime < 250 || isCooldown) {
        // Visual feedback for cooldown
        const sendBtn = document.getElementById("send-btn");
        sendBtn.classList.add("cooldown");
        sendBtn.disabled = true;

        // Clear any existing timeout
        if (cooldownTimeout) clearTimeout(cooldownTimeout);

        // Show small tooltip
        showToast("Slow down", "info");

        // Set cooldown state
        isCooldown = true;

        // Reset after cooldown period
        cooldownTimeout = setTimeout(() => {
            sendBtn.classList.remove("cooldown");
            sendBtn.disabled = false;
            isCooldown = false;
        }, 250);

        return;
    }

    // Update last message time
    lastMessageTime = currentTime;

    // Check for invalid characters or zero-width characters
    if (/[\u200B-\u200D\uFEFF]/.test(messageText)) {
        messageInput.value = "";
        showToast("Message contains invalid characters", "error");
        return;
    }

    // Check for excessive whitespace
    if (messageText.split(/\s+/).length > 40) {
        messageInput.value = "";
        showToast("Message contains excessive whitespace", "error");
        return;
    }

    // Check if message length exceeds 500 characters
    if (messageText.length > 500) {
        messageInput.value = "";
        showToast("Message cannot exceed 500 characters", "error");
        return;
    }

    // Check if message is empty
    if (messageText === "") {
        showToast("Message cannot be empty", "error");
        return;
    }

    // Check if the message is a command
    if (messageText.startsWith("/")) {
        handleCommand(messageText.slice(1).trim());
        return;
    }

    // Send the message
    if (state.currentRoom && state.sessionToken) {
        try {
            let finalMessage = messageText;
            let encryptionMeta = null;

            // Encrypt the message if encryption is enabled and a key is available
            if (state.encryptionEnabled && state.encryptionKey) {
                const encryptedData = await encryptionUtils.encryptMessage(messageText, state.encryptionKey);

                // Create a formatted message with encryption metadata
                finalMessage = JSON.stringify(encryptedData);
                encryptionMeta = {
                    algorithm: state.keyAlgorithm,
                    encrypted: true
                };
            }

            socket.emit("sendMessage", {
                roomCode: state.currentRoom,
                message: finalMessage,
                sessionToken: state.sessionToken,
                isEncrypted: state.encryptionEnabled && state.encryptionKey !== null,
                encryptionMeta
            });

            messageInput.value = ""; // Clear input field

            // Apply brief cooldown visual feedback
            const sendBtn = document.getElementById("send-btn");
            sendBtn.classList.add("cooldown");
            sendBtn.disabled = true;
            isCooldown = true;

            // Reset after cooldown period
            cooldownTimeout = setTimeout(() => {
                sendBtn.classList.remove("cooldown");
                sendBtn.disabled = false;
                isCooldown = false;
            }, 250);
        } catch (error) {
            console.error('Failed to send message:', error);
            showToast('Failed to send message', 'error');
        }
    } else if (!state.sessionToken) {
        showToast("Session expired. Please rejoin the room", "error");
        leaveRoom();
    } else {
        showToast("You're not in a room", "error");
    }
}

function handleCommand(command) {
    switch (command) {
        case "clear":
            messagesContainer.innerHTML = "";
            showToast("Chat cleared", "info");
            messageInput.value = "";
            break;

        case "leave":
            leaveRoom();
            messageInput.value = "";
            break;

        case "help":
            toggleCommandHelpModal(true);
            messageInput.value = "";
            break;

        default:
            showToast("Unknown command", "error");
            messageInput.value = "";
            break;
    }
}

// Socket Event Handlers
socket.on('roomCreated', async function ({ roomCode, users, sessionToken, csrfToken }) {
    state.currentRoom = roomCode;
    state.isRoomOwner = true;
    state.users = users;
    state.sessionToken = sessionToken;
    state.csrfToken = csrfToken;

    roomCodeDisplay.textContent = roomCode;
    navigateTo('chat-room');

    // Share the encryption key by default in the room code
    if (state.encryptionEnabled && state.encryptionKey) {
        try {
            const exportedKey = await encryptionUtils.exportKey(state.encryptionKey);
            const combinedCode = `${roomCode}#${exportedKey}`;

            // Show a message with instructions to share the room code
            addSystemMessage(`Encrypted room created with code: ${roomCode}`);

            // Show toast notification
            showToast(`Encrypted room created successfully`, 'success');
        } catch (error) {
            console.error('Failed to export encryption key:', error);
            addSystemMessage(`Room created with code: ${roomCode}`);
            addSystemMessage(`Warning: Failed to set up encryption. Messages will not be encrypted.`);

            showToast(`Room created, but encryption failed`, 'warning');
        }
    } else {
        // No encryption
        addSystemMessage(`Room created with code: ${roomCode}`);
        showToast(`Room created with code: ${roomCode}`, 'success');
    }
});

socket.on('roomJoined', ({ roomCode, users, messages, sessionToken, csrfToken, isRoomOwner }) => {
    state.currentRoom = roomCode;
    state.users = users;
    state.sessionToken = sessionToken;
    state.csrfToken = csrfToken;
    state.isRoomOwner = isRoomOwner || false;
    roomCodeDisplay.textContent = roomCode;
    navigateTo('chat-room');

    // Display existing messages
    messages.forEach(message => {
        // Skip system messages - they will be processed separately
        if (!message.isSystem) {
            processAndAddMessage(message);
        }
    });

    // Add system message and display occupents

    addSystemMessage(`Welcome to ${roomCode}! Current occupants: ${users.filter(user => user !== state.username).join(', ')}`);

    // Show encryption status
    if (state.encryptionEnabled && state.encryptionKey) {
        addSystemMessage(`End-to-end encryption is enabled in this room.`);
    } else if (!state.encryptionKey) {
        addSystemMessage(`Warning: Messages in this room are not end-to-end encrypted.`);
    }

    // Update users list
    updateUsersList();

    // Scroll to bottom
    scrollToBottom();

    // Show toast notification
    showToast(`You joined room: ${roomCode}`, 'success');
});

socket.on('userJoined', ({ username, users }) => {
    state.users = users;
    updateUsersList();

    // Show toast notification
    showToast(`${username} joined the room`, 'info');
});

socket.on('userLeft', ({ username, users, newOwner }) => {
    state.users = users;

    // Check if current user is now the room owner
    if (newOwner && socket.id === newOwner) {
        state.isRoomOwner = true;
        showToast('You are now the room owner', 'info');
    }

    updateUsersList();

    // Show toast notification
    showToast(`${username} left the room`, 'info');
});

socket.on('roomDeleted', () => {
    showToast('This room has been deleted', 'error');

    // Reset state
    state.currentRoom = null;
    state.isRoomOwner = false;
    state.sessionToken = null;
    state.csrfToken = null;
    state.encryptionKey = null;

    // Clear UI
    messagesContainer.innerHTML = '';

    // Navigate back
    navigateTo('room-selection');
});

socket.on('error', (errorMessage) => {
    showToast(errorMessage, 'error');
});

// User kicked events
socket.on('userKicked', ({ username }) => {
    showToast(`${username} was kicked from the room`, 'success');
});

socket.on('kickedFromRoom', () => {
    showToast('You have been kicked from the room', 'error');
    leaveRoom();
});

// Message handling with encryption
socket.on('newMessage', (message) => {
    processAndAddMessage(message);
});

// Process incoming messages (decrypt if needed)
async function processAndAddMessage(message) {
    try {
        // Handle system messages separately
        if (message.isSystem || message.username === 'System') {
            addSystemMessage(message.text);
            return;
        }

        // If message is encrypted and we have a key, decrypt it
        if (message.isEncrypted && state.encryptionKey) {
            try {
                // Try to parse the JSON encrypted data
                const encryptedData = JSON.parse(message.text);

                // Decrypt the message
                const decryptedText = await encryptionUtils.decryptMessage(encryptedData, state.encryptionKey);

                // Create a decrypted version of the message
                const decryptedMessage = {
                    ...message,
                    text: decryptedText,
                    decrypted: true
                };

                // Add the decrypted message
                addMessage(decryptedMessage);
            } catch (error) {
                console.error('Failed to decrypt message:', error);

                // Add a placeholder indicating encryption
                const failedMessage = {
                    ...message,
                    text: '[Encrypted message - unable to decrypt]',
                    decryptionFailed: true
                };

                addMessage(failedMessage);
            }
        } else {
            // Message is not encrypted or we don't have a key
            addMessage(message);
        }
    } catch (error) {
        console.error('Error processing message:', error);

        // If all else fails, just show the message as-is
        addMessage(message);
    }
}

// UI Helper Functions
function navigateTo(screen) {
    // Hide all screens
    welcomeScreen.classList.add('hidden');
    roomSelection.classList.add('hidden');
    chatRoom.classList.add('hidden');

    // Show the requested screen
    document.getElementById(screen).classList.remove('hidden');

    // Focus appropriate input field
    if (screen === 'welcome-screen') {
        usernameInput.focus();
    } else if (screen === 'room-selection') {
        roomCodeInput.focus();
    } else if (screen === 'chat-room') {
        messageInput.focus();
    }
}

function toggleModal(modal, show) {
    if (!modal) return;

    modal.style.display = show ? 'flex' : 'none';

    if (modal === usersModal && show) {
        // Show admin controls if user is room owner
        adminControls.classList.toggle('hidden', !state.isRoomOwner);
        updateUsersList();
    }
}

function addMessage(message) {
    const li = document.createElement('li');

    // Check if this message is from the current user
    const isCurrentUser = message.username === state.username;
    if (isCurrentUser) {
        li.classList.add('self-message');
    }

    // Add encryption or decryption status classes
    if (message.isEncrypted) {
        li.classList.add('encrypted-message');
    }
    if (message.decrypted) {
        li.classList.add('decrypted-message');
    }
    if (message.decryptionFailed) {
        li.classList.add('decryption-failed');
    }

    // Format timestamp
    const timestamp = new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    // Create message container with avatar
    const messageContainer = document.createElement('div');
    messageContainer.classList.add('message-container');

    // Create avatar
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');

    // Set avatar content - first letter of username or custom icon
    const firstLetter = message.username.charAt(0).toUpperCase();
    avatar.textContent = firstLetter;

    // Generate a consistent color based on username
    const hue = getHashCode(message.username) % 360;

    if (!isCurrentUser) {
        avatar.style.backgroundColor = `hsl(${hue}, 70%, 40%)`;
    }

    // Create message content
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');

    // Username
    const usernameElement = document.createElement('div');
    usernameElement.classList.add('username');
    usernameElement.textContent = message.username;

    // Add encryption indicator to username if the message is encrypted
    if (message.isEncrypted) {
        const encryptionIndicator = document.createElement('span');
        encryptionIndicator.textContent = '  ⧉';
        encryptionIndicator.title = 'This message is encrypted';
        encryptionIndicator.style.fontSize = '0.8em';
        usernameElement.appendChild(encryptionIndicator);
    }
    messageElement.appendChild(usernameElement);

    // Message text
    const textElement = document.createElement('div');
    textElement.classList.add('text');
    textElement.textContent = message.text;
    messageElement.appendChild(textElement);

    // Timestamp
    const timestampElement = document.createElement('div');
    timestampElement.classList.add('timestamp');
    timestampElement.textContent = timestamp;

    // Apply current timestamp visibility setting from settings manager
    if (window.settingsManager) {
        const settings = window.settingsManager.getSettings();
        timestampElement.style.display = settings.showTimestamps ? 'block' : 'none';
    }

    messageElement.appendChild(timestampElement);

    // Append avatar and message to container
    if (isCurrentUser) {
        // For current user, place message first, then avatar
        messageContainer.appendChild(messageElement);
        messageContainer.appendChild(avatar);
    } else {
        // For other users, place avatar first, then message
        messageContainer.appendChild(avatar);
        messageContainer.appendChild(messageElement);
    }

    // Append the message container to the list item
    li.appendChild(messageContainer);

    // Append to the messages container
    messagesContainer.appendChild(li);

    // Scroll to bottom
    scrollToBottom();
}

// Add this helper function to generate consistent colors from usernames
function getHashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

function addSystemMessage(text) {
    const li = document.createElement('li');
    li.classList.add('system-message');

    // Check if it's a command message to apply special styling
    if (text.startsWith('/')) {
        li.classList.add('command-message');
    }

    li.textContent = text;
    messagesContainer.appendChild(li);

    // Scroll to bottom
    scrollToBottom();
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messages-container');
    if (messagesContainer) {
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'smooth'
        });
    }
}

function updateUsersList() {
    userList.innerHTML = '';

    state.users.forEach(username => {
        const li = document.createElement('li');
        li.textContent = username;

        // Only show kick button for room owner and for other users (not for self)
        if (state.isRoomOwner && username !== state.username) {
            const kickBtn = document.createElement('button');
            kickBtn.className = 'icon-btn warning';
            kickBtn.title = 'Kick user';
            kickBtn.innerHTML = '<i class="fas fa-user-slash"></i>';

            kickBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                confirmKickUser(username);
            });

            li.appendChild(kickBtn);
        }

        // Highlight the room owner
        if (username === state.username && state.isRoomOwner) {
            li.classList.add('owner');
        }

        userList.appendChild(li);
    });
}

// User kick functionality
let userToKick = null;

function createKickConfirmModal() {
    // Check if modal already exists
    if (document.getElementById('kick-confirm-modal')) {
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'kick-confirm-modal';
    modal.className = 'modal';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-user-slash"></i> Kick User</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <p>Are you sure you want to kick <span id="kick-username"></span> from the room?</p>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">
                    This user will not be able to rejoin unless they know the room code.
                </p>
            </div>
            <div class="modal-footer">
                <button id="confirm-kick-btn" class="danger-btn">Yes, Kick User</button>
                <button id="cancel-kick-btn" class="primary-btn">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add event listeners to the new buttons
    document.querySelector('#kick-confirm-modal .close-modal')
        .addEventListener('click', () => toggleKickModal(false));
    document.getElementById('cancel-kick-btn')
        .addEventListener('click', () => toggleKickModal(false));
    document.getElementById('confirm-kick-btn')
        .addEventListener('click', executeKickUser);

    return modal;
}

function toggleKickModal(show, username = null) {
    const modal = document.getElementById('kick-confirm-modal') || createKickConfirmModal();

    if (show && username) {
        userToKick = username;
        document.getElementById('kick-username').textContent = username;
    } else {
        userToKick = null;
    }

    modal.style.display = show ? 'flex' : 'none';
}

function confirmKickUser(username) {
    toggleKickModal(true, username);
}

function executeKickUser() {
    if (!userToKick || !state.currentRoom || !state.isRoomOwner || !state.csrfToken) {
        toggleKickModal(false);
        return;
    }

    socket.emit('kickUser', {
        roomCode: state.currentRoom,
        userToKickUsername: userToKick,
        csrfToken: state.csrfToken
    });

    toggleKickModal(false);
}

// Keyboard/mouse navigation detection
let usingKeyboard = false;

document.addEventListener('keydown', function () {
    if (!usingKeyboard) {
        document.body.classList.add('keyboard-nav');
        usingKeyboard = true;
    }
});

document.addEventListener('mousedown', function () {
    if (usingKeyboard) {
        document.body.classList.remove('keyboard-nav');
        usingKeyboard = false;
    }
});

// Toast notification system
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    // Create toast element
    const toast = document.createElement('div');
    toast.classList.add('toast', type);

    // Create icon based on toast type
    const icon = document.createElement('i');
    icon.style.marginRight = '8px';

    switch (type) {
        case 'success':
            icon.className = 'fas fa-check-circle';
            icon.style.color = 'var(--success)';
            break;
        case 'error':
            icon.className = 'fas fa-exclamation-circle';
            icon.style.color = 'var(--danger)';
            break;
        default:
            icon.className = 'fas fa-info-circle';
            icon.style.color = 'var(--accent-primary)';
    }

    // Create message text element
    const messageText = document.createElement('span');
    messageText.textContent = message;

    // Add elements to toast
    toast.appendChild(icon);
    toast.appendChild(messageText);

    // Add to container
    toastContainer.appendChild(toast);

    // Get duration from settings if available
    const duration = window.settingsManager ?
        window.settingsManager.getSettings().toastDuration : 3000;

    // Auto-remove after duration
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => {
            if (toast.parentNode === toastContainer) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, duration);
}

// Make sure DOM is loaded before adding handlers
document.addEventListener('DOMContentLoaded', function () {
    // Get all modal elements
    const modals = document.querySelectorAll('.modal');

    // Get all modal trigger buttons
    const settingsBtn = document.getElementById('settings-btn');
    const showUsersBtn = document.getElementById('show-users-btn');
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const tosLink = document.getElementById('tos-link');

    // Get all modal close buttons
    const closeButtons = document.querySelectorAll('.close-modal');

    // Get specific modal elements
    const settingsModal = document.getElementById('settings-modal');
    const usersModal = document.getElementById('users-modal');
    const leaveConfirmModal = document.getElementById('leave-confirm-modal');
    const tosModal = document.getElementById('tos-modal');
    const commandHelpModal = document.getElementById('command-help-modal');
    const kickConfirmModal = document.getElementById('kick-confirm-modal');

    // Modal open function
    function openModal(modal) {
        if (!modal) return;
        modal.style.display = 'flex';
        console.log('Opening modal:', modal.id);
    }

    // Modal close function
    function closeModal(modal) {
        if (!modal) return;
        modal.style.display = 'none';
        console.log('Closing modal:', modal.id);
    }

    // Close all modals function
    function closeAllModals() {
        modals.forEach(modal => {
            modal.style.display = 'none';
        });
        console.log('Closed all modals');
    }

    // Add click event listeners to open modals
    if (settingsBtn) settingsBtn.addEventListener('click', () => openModal(settingsModal));
    if (showUsersBtn) showUsersBtn.addEventListener('click', () => openModal(usersModal));
    if (leaveRoomBtn) leaveRoomBtn.addEventListener('click', () => openModal(leaveConfirmModal));
    if (tosLink) tosLink.addEventListener('click', (e) => {
        e.preventDefault();
        openModal(tosModal);
    });

    // Add click event listeners to close buttons
    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            if (modal) closeModal(modal);
        });
    });

    // Handle specific modal close buttons
    const closeTosBtn = document.getElementById('close-tos-btn');
    if (closeTosBtn) closeTosBtn.addEventListener('click', () => closeModal(tosModal));

    const closeCommandHelpBtn = document.getElementById('close-command-help-btn');
    if (closeCommandHelpBtn) closeCommandHelpBtn.addEventListener('click', () => closeModal(commandHelpModal));

    // Leave room confirmation buttons
    const leaveRoomConfirmBtn = document.querySelector('#leave-confirm-modal .primary-btn');
    const cancelLeaveBtn = document.querySelector('#leave-confirm-modal .danger-btn');

    if (leaveRoomConfirmBtn) {
        leaveRoomConfirmBtn.addEventListener('click', () => {
            closeModal(leaveConfirmModal);
            // Add logic to leave room here if needed
            console.log('Confirmed leaving room');

            // This will trigger the leaveRoom function if it exists
            if (typeof leaveRoom === 'function') {
                leaveRoom();
            }
        });
    }

    if (cancelLeaveBtn) {
        cancelLeaveBtn.addEventListener('click', () => {
            closeModal(leaveConfirmModal);
        });
    }

    // Kick user confirmation buttons
    const confirmKickBtn = document.getElementById('confirm-kick-btn');
    const cancelKickBtn = document.getElementById('cancel-kick-btn');

    if (confirmKickBtn) {
        confirmKickBtn.addEventListener('click', () => {
            closeModal(kickConfirmModal);
            // Add logic to kick user here if needed
            console.log('Confirmed kicking user');

            // This will trigger the executeKickUser function if it exists
            if (typeof executeKickUser === 'function') {
                executeKickUser();
            }
        });
    }

    if (cancelKickBtn) {
        cancelKickBtn.addEventListener('click', () => {
            closeModal(kickConfirmModal);
        });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        modals.forEach(modal => {
            if (e.target === modal) {
                closeModal(modal);
            }
        });
    });

    // Global functions to control modals
    window.showModal = openModal;
    window.hideModal = closeModal;
    window.closeAllModals = closeAllModals;

    // Export functions to global scope for compatibility with existing code
    window.toggleModal = function (modal, show) {
        if (!modal) return;
        modal.style.display = show ? 'flex' : 'none';
        console.log(show ? 'Showing' : 'Hiding', 'modal:', modal.id);

        // Special handling for user modal
        if (modal === usersModal && show) {
            const adminControls = document.querySelector('.admin-controls');
            if (adminControls) {
                const isRoomOwner = window.state && window.state.isRoomOwner;
                adminControls.classList.toggle('hidden', !isRoomOwner);

                // Update user list
                if (typeof updateUsersList === 'function') {
                    updateUsersList();
                }
            }
        }
    };

    window.toggleLeaveModal = function (show) {
        toggleModal(leaveConfirmModal, show);
    };

    window.toggleTosModal = function (show) {
        toggleModal(tosModal, show);
    };

    window.toggleCommandHelpModal = function (show) {
        toggleModal(commandHelpModal, show);
    };

    console.log('Modal helpers initialized');
});