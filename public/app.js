// Initialize connection
const socket = io();

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
  
  // Message form
  messageForm.addEventListener('submit', handleSendMessage);
  
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
    
    // Navigate back to room selection after everything is done
    navigateTo('room-selection');
    window.location.href = '/'; // reloads the app or navigates to a welcome page
    window.location.reload();
  }
}

function handleDeleteRoom() {
  if (state.isRoomOwner) {
    socket.emit('deleteRoom', state.currentRoom);
    toggleModal(usersModal, false);
  } else {
    showToast('Only the room owner can delete the room', 'error');
  }
}

function handleSendMessage(e) {
  e.preventDefault();
  const message = messageInput.value.trim();
  
  if (message && state.currentRoom) {
    socket.emit('sendMessage', {
      roomCode: state.currentRoom,
      message
    });
    
    messageInput.value = '';
  }
}

// Socket Event Handlers
socket.on('roomCreated', ({ roomCode, users }) => {
  state.currentRoom = roomCode;
  state.isRoomOwner = true;
  state.users = users;
  
  roomCodeDisplay.textContent = roomCode;
  navigateTo('chat-room');
  
  addSystemMessage(`Room created with code: ${roomCode}`);
  showToast('Room created successfully!', 'success');
});

socket.on('roomJoined', ({ roomCode, users, messages }) => {
  state.currentRoom = roomCode;
  state.users = users;
  
  roomCodeDisplay.textContent = roomCode;
  navigateTo('chat-room');
  
  // Display existing messages
  messages.forEach(msg => addMessage(msg));
  
  addSystemMessage(`You joined room: ${roomCode}`);
  showToast('Room joined successfully!', 'success');
});

socket.on('userJoined', ({ username, users }) => {
  state.users = users;
  addSystemMessage(`${username} joined the room`);
  updateUsersList();
});

socket.on('userLeft', ({ username, users, newOwner }) => {
  state.users = users;
  
  // Check if current user is now the room owner
  if (newOwner && socket.id === newOwner) {
    state.isRoomOwner = true;
    showToast('You are now the room owner', 'info');
  }
  
  addSystemMessage(`${username} left the room`);
  updateUsersList();
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

function addSystemMessage(text) {
  const li = document.createElement('li');
  li.classList.add('system-message');
  li.textContent = text;
  messagesContainer.appendChild(li);
  
  // Scroll to bottom
  scrollToBottom();
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toast-container');
  
  // Create toast element
  const toast = document.createElement('div');
  toast.classList.add('toast', type);
  toast.textContent = message;
  
  // Add to container
  toastContainer.appendChild(toast);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toastContainer.removeChild(toast);
    }, 300);
  }, 3000);
}
