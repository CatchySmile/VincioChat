// Enhanced Settings Management

// Define default settings
const DEFAULT_SETTINGS = {
    theme: 'dark',
    accentColor: 'purple',
    notificationsEnabled: true,
    toastDuration: 3000,
    showTimestamps: true,
  };
  
  // Current settings object
  let currentSettings = { ...DEFAULT_SETTINGS };
  
  // DOM Elements for settings
  const settingsModal = document.getElementById('settings-modal');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const themeSelect = document.getElementById('theme-select');
  const accentColorSelect = document.getElementById('accent-color-select');
  const notificationToggle = document.getElementById('notification-toggle');
  const toastDurationSelect = document.getElementById('toast-duration-select');
  const timestampToggle = document.getElementById('message-timestamp-toggle');
  
  // Initialize settings
  function initializeSettings() {
    // Event listener for settings button
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => toggleModal(settingsModal, true));
    }
    
    // Event listener for save settings button
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', saveSettings);
    }
  
    // Load settings from localStorage
    loadSettings();
    
    // Apply settings immediately
    applySettings(currentSettings);
  }
  
  // Save settings to localStorage
  function saveSettings() {
    // Collect settings from form elements
    const newSettings = {
      theme: themeSelect.value,
      accentColor: accentColorSelect.value,
      notificationsEnabled: notificationToggle.checked,
      toastDuration: parseInt(toastDurationSelect.value),
      showTimestamps: timestampToggle.checked,
    };
    
    // Update current settings
    currentSettings = { ...newSettings };
    
    // Save to localStorage
    localStorage.setItem('scratchyChatSettings', JSON.stringify(currentSettings));
    
    // Apply the new settings
    applySettings(currentSettings);
    
    // Show confirmation and close modal
    showToast('Settings saved successfully', 'success');
    toggleModal(settingsModal, false);
  }
  
  // Load settings from localStorage
  function loadSettings() {
    try {
      const savedSettings = localStorage.getItem('scratchyChatSettings');
      
      if (savedSettings) {
        // Parse saved settings
        const parsedSettings = JSON.parse(savedSettings);
        
        // Merge with defaults (in case new settings were added)
        currentSettings = { ...DEFAULT_SETTINGS, ...parsedSettings };
      }
      
      // Update form elements to reflect current settings
      updateSettingsForm();
      
    } catch (error) {
      console.error('Error loading settings:', error);
      // If there's an error, reset to defaults
      currentSettings = { ...DEFAULT_SETTINGS };
    }
  }
  
  // Update settings form to reflect current settings
  function updateSettingsForm() {
    // Set form values based on current settings
    themeSelect.value = currentSettings.theme;
    accentColorSelect.value = currentSettings.accentColor;
    notificationToggle.checked = currentSettings.notificationsEnabled;
    toastDurationSelect.value = currentSettings.toastDuration.toString();
    timestampToggle.checked = currentSettings.showTimestamps;
  }
  
  // Apply settings to the UI
  function applySettings(settings) {
    // Apply theme
    document.documentElement.classList.toggle('light-theme', settings.theme === 'light');
    document.documentElement.classList.toggle('mint-breeze', settings.theme === 'mint');
    document.documentElement.classList.toggle('material-theme', settings.theme === 'material');
    document.documentElement.classList.toggle('modern-black-red', settings.theme === 'blackred');
    document.documentElement.classList.toggle('matrix-theme', settings.theme === 'matrix');


    
    // Apply accent color
    applyAccentColor(settings.accentColor);
    
    
    // Apply timestamp visibility
    applyTimestampVisibility(settings.showTimestamps);
    
    // Update toast duration
    window.toastDuration = settings.toastDuration;
  }
  
  // Apply the selected accent color
  function applyAccentColor(color) {
    // Remove any existing accent color classes
    document.documentElement.classList.remove('accent-purple', 'accent-blue', 'accent-red', 'accent-green', 'accent-pink');
    
    // Add the selected accent color class
    document.documentElement.classList.add(`accent-${color}`);
    
    // Apply CSS variables for the accent color
    const root = document.documentElement;
    
    switch (color) {
      case 'blue':
        root.style.setProperty('--accent-primary', '#4285f4');
        root.style.setProperty('--accent-secondary', '#3367d6');
        root.style.setProperty('--accent-tertiary', '#2a56c6');
        root.style.setProperty('--accent-hover', '#5a95f5');
        break;
      case 'red':
        root.style.setProperty('--accent-primary', '#ff3333');
        root.style.setProperty('--accent-secondary', '#e60000');
        root.style.setProperty('--accent-tertiary', '#800000');
        root.style.setProperty('--accent-hover', '#660000');
        break;
      case 'green':
        root.style.setProperty('--accent-primary', '#34a853');
        root.style.setProperty('--accent-secondary', '#2e9549');
        root.style.setProperty('--accent-tertiary', '#1e8e3e');
        root.style.setProperty('--accent-hover', '#46bf65');
        break;
      case 'pink':
        root.style.setProperty('--accent-primary', '#e84e8a');
        root.style.setProperty('--accent-secondary', '#d84177');
        root.style.setProperty('--accent-tertiary', '#c13b6b');
        root.style.setProperty('--accent-hover', '#ec699b');
        break;
      case 'black':
        root.style.setProperty('--accent-primary', '#4d4d4d');
        root.style.setProperty('--accent-secondary', '#1a1a1a');
        root.style.setProperty('--accent-tertiary', '#262626');
        root.style.setProperty('--accent-hover', '#333333');
        break;
      default: // Purple (default)
        root.style.setProperty('--accent-primary', '#8a54fd');
        root.style.setProperty('--accent-secondary', '#6a3dd8');
        root.style.setProperty('--accent-tertiary', '#4728a0');
        root.style.setProperty('--accent-hover', '#9d73ff');
        break;
    }
    
    // Update gradient variables as well
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
    const tertiary = getComputedStyle(document.documentElement).getPropertyValue('--accent-tertiary').trim();
    const hover = getComputedStyle(document.documentElement).getPropertyValue('--accent-hover').trim();
    const secondary = getComputedStyle(document.documentElement).getPropertyValue('--accent-secondary').trim();
    
    root.style.setProperty('--gradient-accent', `linear-gradient(135deg, ${primary}, ${tertiary})`);
    root.style.setProperty('--gradient-accent-hover', `linear-gradient(135deg, ${hover}, ${secondary})`);
  }
  
  
  // Apply timestamp visibility
  function applyTimestampVisibility(show) {
    const timestamps = document.querySelectorAll('.timestamp');
    timestamps.forEach(timestamp => {
      timestamp.style.display = show ? 'block' : 'none';
    });
  }
  
  // Modified showToast function to use the configurable duration
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
    
    // Use configurable duration or default to 3000ms
    const duration = window.toastDuration || currentSettings.toastDuration || 3000;
    
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
  
  // Initialize settings when the document is loaded
  document.addEventListener('DOMContentLoaded', initializeSettings);
  
  // Export functions for use in other scripts
  window.showToast = showToast;
  window.applySettings = applySettings;
  window.currentSettings = currentSettings;
