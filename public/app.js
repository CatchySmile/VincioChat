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

function confirmLeaveRoom() {
  toggleLeaveModal(false);
  leaveRoom();
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

function updateUsersList() {
  userList.innerHTML = '';
  
  state.users.forEach(username => {
    const li = document.createElement('li');
    li.textContent = username;
    
    // Highlight the room owner
    if (username === state.username && state.isRoomOwner) {
      li.classList.add('owner');
      li.textContent += ' (owner)';
    }
    userList.appendChild(li);
  });
}

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

// IMPORTANT: Replace this message form submit handler with a fixed version
document.getElementById("message-form").addEventListener("submit", function(event) {
  event.preventDefault();

  const messageInput = document.getElementById("message-input");
  const messageText = messageInput.value.trim();

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

  // Add 250ms cooldown between messaging either here or enforce it via SecurityUtils
  
  }

  // Check if the message is a command
  if (messageText.startsWith("/")) {
    const command = messageText.slice(1).trim();
    // Handle commands
    //clear command
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
      // help command
    } else if (command === "help") {
      showToast("Available commands: /clear, /help, /leave", "info");
      messageInput.value = "";
      return;
    } else {
      showToast("Unknown command", "error");
      messageInput.value = "";
      return;
    }
  }

  // Send message if it's within the limit - FIXED: using state.currentRoom instead of currentRoomCode
  if (state.currentRoom && state.sessionToken) {
    socket.emit("sendMessage", { 
      roomCode: state.currentRoom, 
      message: messageText,
      sessionToken: state.sessionToken 
    });
    messageInput.value = ""; // Clear input field
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
