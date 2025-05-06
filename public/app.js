const socket = io({
  transports: ['polling', 'websocket'], // Allow both for compatibility
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000
});

// Add these debugging listeners right after the socket initialization
socket.on('connect', () => {
  console.log('Connected to server with ID:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  showToast('Failed to connect to server: ' + error.message, 'error');
});


// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const roomSelection = document.getElementById('room-selection');
const chatRoom = document.getElementById('chat-room');
const usersModal = document.getElementById('users-modal');
const adminControls = document.querySelector('.admin-controls');
const leaveConfirmModal = document.getElementById('leave-confirm-modal');
const tosModal = document.getElementById('tos-modal');
const commandModal = document.getElementById(`command-help-modal`)

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
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages');
const userList = document.getElementById('user-list');
const tosLink = document.getElementById('tos-link');



socket.on('connect', () => {
  console.log('Connected to server with ID:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  showToast('Failed to connect to server', 'error');
});


// In app.js, add CSRF token to all state-changing requests
function sendStateChangingRequest(eventName, data) {
  if (!state.csrfToken) {
    showToast('Security token missing. Please rejoin the room.', 'error');
    leaveRoom();
    return false;
  }
  
  // Add CSRF token to data
  const secureData = {
    ...data,
    csrfToken: state.csrfToken
  };
  
  socket.emit(eventName, secureData);
  return true;
}


// Close buttons for all modals
document.querySelectorAll('.close-modal').forEach(btn => {
  btn.addEventListener('click', function() {
    // Find the parent modal and hide it
    const modal = this.closest('.modal');
    if (modal) {
      modal.style.display = 'none';
    }
  });
});

// App State
const state = {
  username: '',
  currentRoom: null,
  isRoomOwner: false,
  users: []
};
showToast('Welcome to Scratchy Chat', 'info');
// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
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
  
  // Configure leave room confirmation buttons
  document.getElementById('leave-confirm-modal').querySelector('.primary-btn').addEventListener('click', confirmLeaveRoom);
  document.getElementById('leave-confirm-modal').querySelector('.danger-btn').addEventListener('click', () => toggleLeaveModal(false));
  
  // Kick modal
  createKickConfirmModal();

  // TOS Link
  tosLink.addEventListener('click', (e) => {
    e.preventDefault();
    toggleTosModal(true);
  });
  
  // Close TOS button
  document.getElementById('close-tos-btn').addEventListener('click', () => toggleTosModal(false));
  
  // Handle browser window/tab closing or refreshing
  window.addEventListener('beforeunload', () => {
    if (state.currentRoom) {
      socket.emit('leaveRoom', state.currentRoom);
    }
  });
});

// Event Handlers
function handleUsernameSubmit() {
  const username = usernameInput.value.trim();
  if (username) {
    state.username = username;
    navigateTo('room-selection');
  } else {
    showToast('Please enter a username', 'error');
  }
  // Check for invalid characters or zwj characters
  if (/[\u200B-\u200D\uFEFF]/.test(username)) {
    usernameInput.value = '';
    navigateTo('welcome-screen');
    showToast('Username contains invalid characters.', 'error');
    return;
  }
  // Check for excessive whitespace
  if (username.split(/\s+/).length > 5) {
    usernameInput.value = '';
    navigateTo('welcome-screen');
    showToast('Username contains excessive whitespace.', 'error');
    return;
  }
  // Check if username length exceeds 20 characters
  if (username.length > 20) {
    usernameInput.value = '';
    navigateTo('welcome-screen');
    showToast('Username cannot exceed 20 characters', 'error');
    return;
  }
  
  // Check if username has special characters 
  if (/[^a-zA-Z0-9_]/.test(username)) {
    usernameInput.value = '';
    navigateTo('welcome-screen');
    showToast('Username can only contain letters, numbers, and underscores.', 'error');
    return;
  }
  // Ensure username is safe for SQL
  const sanitizedUsername = username.replace(/'/g, "''");
  usernameInput.value = sanitizedUsername;
  state.username = sanitizedUsername;
}

function handleCreateRoom() {
  socket.emit('createRoom', state.username);
  showToast('Creating room...', 'info');
}

function sanitizeInput(input, maxLength) {
  let sanitized = input.replace(/<[^>]*>/g, '')
                       .replace(/\s+/g, ' ')
                       .trim();
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
}

function handleJoinRoom() {
  const roomCode = roomCodeInput.value.trim();
  if (roomCode) {
    socket.emit('joinRoom', { roomCode, username: state.username });
    showToast('Joining room...', 'info');
  } else {
    showToast('Please enter a room code', 'error');
  }
  // Check for invalid characters or zwj characters
  if (/[\u200B-\u200D\uFEFF]/.test(roomCode)) {
    roomCodeInput.value = '';
    showToast('Room code contains invalid characters.', 'error');
    return;
  }
  // Check for excessive whitespace
  if (roomCode.split(/\s+/).length > 2) {
    roomCodeInput.value = '';
    showToast('Room code contains excessive whitespace.', 'error');
    return;
  }
  // Check if room code length exceeds 12 characters
  if (roomCode.length > 12) {
    navigateTo('room-selection');
    showToast('Room code cannot exceed 12 characters', 'error');
    return;
  }
  // Check if room code has special characters other than letters and numbers and underscores and dashes
  if (/[^a-zA-Z0-9_-]/.test(roomCode)) {
    roomCodeInput.value = '';
    navigateTo('room-selection');
    showToast('Room code can only contain letters, numbers, underscores, and dashes.', 'error');
    return;
  }
  // Ensure room code is safe for SQL
  const sanitizedRoomCode = roomCode.replace(/'/g, "''");
  roomCodeInput.value = sanitizedRoomCode;
  state.currentRoom = sanitizedRoomCode;
}

function handleCopyRoomCode() {
  if (state.currentRoom) {
    navigator.clipboard.writeText(state.currentRoom)
      .then(() => showToast('Room code copied to clipboard', 'success'))
      .catch(() => showToast('Failed to copy room code', 'error'));
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
  toggleModal(commandModal, show)
}

function confirmLeaveRoom() {
  toggleLeaveModal(false);
  leaveRoom();
}

// Use the showToast function from settings.js if available, otherwise define a fallback
if (!window.showToast) {
  // Define fallback only if settings.js hasn't loaded or failed
  window.showToast = function(message, type = 'info') {
    console.warn('Using fallback toast implementation - settings.js may not be loaded');
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    
    // Create toast element with safely escaped content
    const toast = document.createElement('div');
    toast.classList.add('toast', type);
    
    // Add icon based on toast type
    const icon = document.createElement('i');
    icon.style.marginRight = '8px';
    
    switch(type) {
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
    messageText.textContent = message; // Using textContent prevents XSS
    
    // Add elements to toast
    toast.appendChild(icon);
    toast.appendChild(messageText);
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => {
        if (toast.parentNode === toastContainer) {
          toastContainer.removeChild(toast);
        }
      }, 300);
    }, 3000);
  };
}

function leaveRoom() {
  if (state.currentRoom) {
    socket.emit('leaveRoom', state.currentRoom);
    state.currentRoom = null;
    state.isRoomOwner = false;
    
    // Clear chat history
    messagesContainer.innerHTML = '';
    roomCodeDisplay.textContent = '';
    state.users = [];
    userList.innerHTML = '';

    // Navigate back to room selection after everything is done
    navigateTo('room-selection');
    showToast('You have left the room', 'info');
    // Hide the users modal if it's open
    if (usersModal.style.display === 'flex') {
      toggleModal(usersModal, false);
    }
    // Hide the leave confirmation modal if it's open
    if (leaveConfirmModal.style.display === 'flex') {
      toggleModal(leaveConfirmModal, false);
    }
    // Refresh the page to clear any residual data
    state.currentRoom = null;
    state.isRoomOwner = false;
    window.location.reload();

  }
}

function handleDeleteRoom() {
  if (state.isRoomOwner) {
    socket.emit('deleteRoom', { 
      roomCode: state.currentRoom,
      csrfToken: state.csrfToken 
    });
    toggleModal(usersModal, false);
  } else {
    showToast('Only the room owner can delete the room', 'error');
  }
}

// Socket Event Handlers
socket.on('roomCreated', ({ roomCode, users, sessionToken, csrfToken }) => {
  state.currentRoom = roomCode;
  state.isRoomOwner = true;
  state.users = users;
  state.sessionToken = sessionToken;
  state.csrfToken = csrfToken;
  
  roomCodeDisplay.textContent = roomCode;
  navigateTo('chat-room');
  
  // Add the centered small system notification (not the large one)
  const li = document.createElement('li');
  li.classList.add('system-message');
  li.textContent = `Room created with code: ${roomCode}`;
  messagesContainer.appendChild(li);
  
  // Also show a toast notification
  showToast(`Room created with code: ${roomCode}`, 'success');
});

socket.on('roomJoined', ({ roomCode, users, messages, sessionToken, csrfToken, isRoomOwner }) => {
  console.log('Room joined with session token:', sessionToken ? 'present' : 'missing');
  
  state.currentRoom = roomCode;
  state.users = users;
  state.sessionToken = sessionToken;
  state.csrfToken = csrfToken;
  state.isRoomOwner = isRoomOwner || false;
  state.lastActivity = Date.now();
  roomCodeDisplay.textContent = roomCode;
  navigateTo('chat-room');
  
  // Display existing messages
  messages.forEach(msg => addMessage(msg));
  
  // Add the centered small system notification (not the large one)
  const li = document.createElement('li');
  li.classList.add('system-message');
  li.textContent = `You joined room: ${roomCode}`;
  messagesContainer.appendChild(li);
  
  // Also show a toast notification
  showToast(`You joined room: ${roomCode}`, 'success');
});

socket.on('userJoined', ({ username, users }) => {
  state.users = users;
  updateUsersList();
  
  // Add the centered small system notification (not the large one)
  const li = document.createElement('li');
  li.classList.add('system-message');
  li.textContent = `${username} joined the room`;
  messagesContainer.appendChild(li);
  
  // Also show a toast notification
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
  
  // Add the centered small system notification (not the large one)
  const li = document.createElement('li');
  li.classList.add('system-message');
  li.textContent = `${username} left the room`;
  messagesContainer.appendChild(li);
  
  // Also show a toast notification
  showToast(`${username} left the room`, 'info');
});

socket.on('newMessage', (message) => {
  addMessage(message);
});

socket.on('roomDeleted', () => {
  showToast('This room has been deleted', 'error');
  navigateTo('room-selection');
  state.currentRoom = null;
  state.isRoomOwner = false;
  messagesContainer.innerHTML = '';
});

socket.on('error', (errorMessage) => {
  showToast(errorMessage, 'error');
});

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
  modal.style.display = show ? 'flex' : 'none';
  
  if (modal === usersModal) {
    // Show admin controls if user is room owner
    adminControls.classList.toggle('hidden', !state.isRoomOwner);
    
    if (show) {
      updateUsersList();
    }
  }
}


let usingKeyboard = false;

// Detect keyboard navigation
document.addEventListener('keydown', function() {
  if (!usingKeyboard) {
    document.body.classList.add('keyboard-nav');
    usingKeyboard = true;
  }
});

// Remove keyboard navigation class when mouse is used
document.addEventListener('mousedown', function() {
  if (usingKeyboard) {
    document.body.classList.remove('keyboard-nav');
    usingKeyboard = false;
  }
});

// Initialize settings when document is ready
document.addEventListener('DOMContentLoaded', function() {
  // Initialize settings
  if (window.settingsManager) {
    window.settingsManager.initialize();
    
    // Register observer for settings changes
    window.settingsManager.addObserver(function(newSettings) {
      console.log('Settings updated:', newSettings);
      
      // Apply timestamp visibility to any new messages
      if (newSettings.showTimestamps !== undefined) {
        updateTimestampsVisibility(newSettings.showTimestamps);
      }
    });
  } else {
    console.error('Settings manager not available!');
  }
});
/**
 * Update visibility of all message timestamps
 * @param {boolean} show - Whether to show timestamps
 */
function updateTimestampsVisibility(show) {
  document.querySelectorAll('.timestamp').forEach(timestamp => {
    timestamp.style.display = show ? 'block' : 'none';
  });
}

// Modify the addMessage function to respect settings
function addMessage(message) {
  // Filter out system messages (that have "System" as username)
  if (message.username === "System") {
    return; // Skip rendering these messages
  }

  const li = document.createElement('li');
  
  // Format timestamp
  const timestamp = new Date(message.timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  // Create message content
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  
  // Username
  const usernameElement = document.createElement('div');
  usernameElement.classList.add('username');
  usernameElement.textContent = message.username;
  messageElement.appendChild(usernameElement);
  
  // Message text
  const textElement = document.createElement('div');
  textElement.classList.add('text');
  textElement.textContent = message.text;
  messageElement.appendChild(textElement);
  
  // Timestamp - respect settings
  const timestampElement = document.createElement('div');
  timestampElement.classList.add('timestamp');
  timestampElement.textContent = timestamp;
  
  // Apply current timestamp visibility setting
  if (window.settingsManager) {
    const settings = window.settingsManager.getSettings();
    timestampElement.style.display = settings.showTimestamps ? 'block' : 'none';
  }
  
  messageElement.appendChild(timestampElement);
  
  li.appendChild(messageElement);
  messagesContainer.appendChild(li);
  
  // Scroll to bottom
  scrollToBottom();
}
//
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

// Create a modal for kick user confirmation
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

// Global variable to store the username of the user to kick
let userToKick = null;

// Toggle the kick confirmation modal
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

// Confirm kick user
function confirmKickUser(username) {
  toggleKickModal(true, username);
}

// Execute kick user
function executeKickUser() {
  if (!userToKick || !state.currentRoom || !state.isRoomOwner) {
    toggleKickModal(false);
    return;
  }
  
  // Find the user's information from the users array
  const userInfo = state.users.find(user => user === userToKick);
  
  if (!userInfo) {
    showToast('User not found', 'error');
    toggleKickModal(false);
    return;
  }
  
  // To ensure security, we need to use a properly formatted event handler
  // that includes CSRF protection
  if (!state.csrfToken) {
    showToast('Security token missing. Please rejoin the room.', 'error');
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

// Add event listener for kicked users confirmation
socket.on('userKicked', ({ username }) => {
  showToast(`${username} was kicked from the room`, 'success');
});

// Event listener for being kicked
socket.on('kickedFromRoom', ({ roomCode }) => {
  showToast('You have been kicked from the room', 'error');
  leaveRoom();
});


function addMessage(message) {
  // Filter out system messages (that have "System" as username)
  if (message.username === "System") {
    return; // Skip rendering these messages
  }

  const li = document.createElement('li');
  
  // Format timestamp
  const timestamp = new Date(message.timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  // Create message content
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  
  // Username
  const usernameElement = document.createElement('div');
  usernameElement.classList.add('username');
  usernameElement.textContent = message.username;
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
  messageElement.appendChild(timestampElement);
  
  li.appendChild(messageElement);
  messagesContainer.appendChild(li);
  // Scroll to bottom
  scrollToBottom();
}


// Keep this function for /commands and other system notifications that might be needed
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
    // Use smooth scrolling behavior
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: 'smooth'
    });
  }
}

  // Add event listener for kicked users
  socket.on('kickedFromRoom', ({ roomCode }) => {
    showToast('You have been kicked from the room', 'error');
    state.currentRoom = null;
    state.isRoomOwner = false;
    navigateTo('room-selection');
  });

  // Add kick functionality to user list items
  function updateUsersList() {
    userList.innerHTML = '';
    
    state.users.forEach(username => {
      const li = document.createElement('li');
      li.textContent = username;
      
      // Only show kick button for room owner and other users
      if (state.isRoomOwner && username !== state.username) {
        const kickBtn = document.createElement('button');
        kickBtn.className = 'icon-btn warning kick-user-btn';
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



let lastMessageTime = 0;
let isCooldown = false;
let cooldownTimeout = null;

document.getElementById("message-form").addEventListener("submit", function(event) {
  event.preventDefault();

  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");
  const messageText = messageInput.value.trim();
  const currentTime = Date.now();
  
  // Check if cooldown period has passed (250ms)
  if (currentTime - lastMessageTime < 250 || isCooldown) {
    // Visual feedback for cooldown
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
    }, 250 - (currentTime - lastMessageTime) < 0 ? 250 : 250 - (currentTime - lastMessageTime));
    
    return;
  }

  // Update last message time
  lastMessageTime = currentTime;

  // Check for invalid characters or zwj characters
  if (/[\u200B-\u200D\uFEFF]/.test(messageText)) {
    messageInput.value = "";
    showToast("Message contains invalid characters.", "error");
    return;
  }
  
  // Check for excessive whitespace
  if (messageText.split(/\s+/).length > 30) {
    messageInput.value = "";
    showToast("Message contains excessive whitespace.", "error");
    return;
  }

  // Check if message length exceeds 500 characters
  if (messageText.length > 500) {
    messageInput.value = "";
    showToast("Message cannot exceed 500 characters.", "error");
    return;
  }
  
  // Check if message is empty
  if (messageText === "") {
    showToast("Message cannot be empty.", "error");
    return;
  }

  // Check if the message is a command
  if (messageText.startsWith("/")) {
    const command = messageText.slice(1).trim();
    // Handle commands
    // clear command
    if (command === "clear") {
      messagesContainer.innerHTML = "";
      showToast("Chat cleared", "info");
      messageInput.value = "";
      return;
    // leave command
    } else if (command === "leave") {
      leaveRoom();
      messageInput.value = "";
      return;
    // help command - FIX: Pass true to toggleCommandHelpModal to show the modal
    } else if (command === "help") {
      toggleCommandHelpModal(true);  // Fixed: Pass true to show the modal
      messageInput.value = "";
      return;
    } else {
      showToast("Unknown command", "error");
      messageInput.value = "";
      return;
    }
  }
  document.getElementById('close-command-help-btn').addEventListener('click', () => {
    toggleCommandHelpModal(false);
  });
  if (state.currentRoom && state.sessionToken) {
    socket.emit("sendMessage", { 
      roomCode: state.currentRoom, 
      message: messageText,
      sessionToken: state.sessionToken 
    });
    messageInput.value = ""; // Clear input field
    
    // Apply brief cooldown visual feedback
    sendBtn.classList.add("cooldown");
    sendBtn.disabled = true;
    isCooldown = true;
    
    // Reset after cooldown period
    cooldownTimeout = setTimeout(() => {
      sendBtn.classList.remove("cooldown");
      sendBtn.disabled = false;
      isCooldown = false;
    }, 250);
    
  } else if (!state.sessionToken) {
    showToast("Session expired. Please rejoin the room.", "error");
    leaveRoom();
  } else {
    showToast("You're not in a room.", "error");
  }
});

function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toast-container');
  
  // Create toast element
  const toast = document.createElement('div');
  toast.classList.add('toast', type);
  
  // Create icon based on toast type
  const icon = document.createElement('i');
  icon.style.marginRight = '8px';
  
  switch(type) {
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
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => {
      if (toast.parentNode === toastContainer) {
        toastContainer.removeChild(toast);
      }
    }, 300);
  }, 3000);
}
