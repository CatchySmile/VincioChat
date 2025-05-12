/**
 * Vincio Chat Loading Screen
 * Displays a stylish loading screen until DOM content is loaded
 */
(function () {
    // Create loading screen element
    function createLoadingScreen() {
        const loadingScreen = document.createElement('div');
        loadingScreen.className = 'vincio-loading-screen';
        loadingScreen.id = 'vincio-loading-screen';

        const loadingLogo = document.createElement('div');
        loadingLogo.className = 'vincio-loading-logo';

        const logoText = document.createElement('h1');
        logoText.textContent = 'Vincio Chat';
        loadingLogo.appendChild(logoText);

        const spinner = document.createElement('div');
        spinner.className = 'vincio-loading-spinner';
        spinner.innerHTML = '<div></div><div></div><div></div>';

        const loadingText = document.createElement('div');
        loadingText.className = 'vincio-loading-text';
        loadingText.textContent = 'Initializing secure chat environment...';

        const loadingSubtext = document.createElement('div');
        loadingSubtext.className = 'vincio-loading-subtext';
        loadingSubtext.textContent = 'Vincio Chat uses zero data retention for maximum privacy';

        loadingScreen.appendChild(loadingLogo);
        loadingScreen.appendChild(spinner);
        loadingScreen.appendChild(loadingText);
        loadingScreen.appendChild(loadingSubtext);

        return loadingScreen;
    }

    // Function to inject loading screen CSS
    function injectLoadingCSS() {
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = './styles/loading.css';

        // Add inline fallback CSS in case the loading.css file isn't available yet
        const inlineStyle = document.createElement('style');
        inlineStyle.textContent = `
      .vincio-loading-screen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #0f0f13;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        opacity: 1;
        transition: opacity 0.5s ease-out;
      }
      .vincio-loading-screen.fade-out {
        opacity: 0;
        pointer-events: none;
      }
      .vincio-loading-logo h1 {
        font-size: 3rem;
        font-weight: 800;
        margin: 0 0 2rem 0;
        color: #8a54fd;
      }
      .vincio-loading-spinner {
        width: 50px;
        height: 50px;
        margin-bottom: 1.5rem;
        border: 4px solid transparent;
        border-top-color: #8a54fd;
        border-left-color: #8a54fd;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      .vincio-loading-text {
        font-size: 1.1rem;
        color: #c2c2c2;
        margin-bottom: 0.5rem;
      }
      .vincio-loading-subtext {
        font-size: 0.9rem;
        color: #c2c2c2;
        opacity: 0.7;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;

        document.head.appendChild(cssLink);
        document.head.appendChild(inlineStyle);
    }

    // Progress tracking
    let resourcesLoaded = 0;
    const totalResources = {
        scripts: 0,
        styles: 0,
        fonts: 0,
        images: 0
    };

    // Update loading text
    function updateLoadingText(text) {
        const loadingText = document.querySelector('.vincio-loading-text');
        if (loadingText) {
            loadingText.textContent = text;
        }
    }

    // Count resources that need to be loaded
    function countResources() {
        totalResources.scripts = document.querySelectorAll('script[src]').length;
        totalResources.styles = document.querySelectorAll('link[rel="stylesheet"]').length;
        totalResources.fonts = document.querySelectorAll('link[rel="preconnect"][href*="fonts"]').length;
        totalResources.images = document.querySelectorAll('img').length;

        return Object.values(totalResources).reduce((sum, count) => sum + count, 0);
    }

    // Show staged loading messages
    function showStagedMessages() {
        const messages = [
            'Loading resources...',
            'Initializing secure chat environment...',
            'Setting up privacy protections...',
            'Preparing ephemeral storage...',
            'Almost ready...'
        ];

        let currentMessage = 0;

        const messageInterval = setInterval(() => {
            updateLoadingText(messages[currentMessage]);
            currentMessage = (currentMessage + 1) % messages.length;
        }, 2000);

        // Clear interval when fully loaded
        document.addEventListener('DOMContentLoaded', () => {
            clearInterval(messageInterval);
            updateLoadingText('Ready!');
        });

        return messageInterval;
    }

    // Hide loading screen function
    function hideLoadingScreen() {
        const loadingScreen = document.getElementById('vincio-loading-screen');
        if (loadingScreen) {
            // First change text to indicate we're ready
            updateLoadingText('Ready!');

            // Wait a moment before hiding
            setTimeout(() => {
                loadingScreen.classList.add('fade-out');

                // Remove from DOM after transition
                setTimeout(() => {
                    if (loadingScreen.parentNode) {
                        loadingScreen.parentNode.removeChild(loadingScreen);
                    }
                }, 500);
            }, 500);
        }
    }

    // Initialize loading screen
    function initLoadingScreen() {
        // Inject CSS
        injectLoadingCSS();

        // Create and append loading screen
        const loadingScreen = createLoadingScreen();
        document.body.appendChild(loadingScreen);

        // Start showing staged messages
        const messageInterval = showStagedMessages();

        // Count resources
        const totalResourceCount = countResources();

        // Hide loading screen when DOM is fully loaded
        window.addEventListener('load', () => {
            clearInterval(messageInterval);
            hideLoadingScreen();
        });

        // Fallback in case 'load' doesn't fire
        document.addEventListener('DOMContentLoaded', () => {
            // Wait a bit longer to ensure resources are loaded
            setTimeout(() => {
                hideLoadingScreen();
            }, 1500);
        });

        // Extra fallback - hide after a maximum time regardless
        setTimeout(() => {
            hideLoadingScreen();
        }, 8000);
    }

    // Check if document is already loaded
    if (document.readyState === 'loading') {
        // Add loading screen immediately
        initLoadingScreen();
    } else {
        // Document already loaded, don't show loading screen
        console.log('Document already loaded, skipping loading screen');
    }
})();