const express = require('express');
const path = require('path');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet());

// Remove x-powered-by
app.disable('x-powered-by');

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    index: false, // Don't serve index automatically for directories
    setHeaders: (res, filePath) => {
        // Prevent MIME sniffing
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Prevent clickjacking
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        // Prevent caching of sensitive files
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store');
        }
    }
}));

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 for unknown routes
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running securely at http://localhost:${PORT}`);
});
