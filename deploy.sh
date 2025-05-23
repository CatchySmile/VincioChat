#!/bin/bash
# deploy.sh - Run as vincio user

set -e

echo "🚀 Deploying Vincio Chat..."

# Configuration
APP_DIR="/home/vincio/vincio-chat"
REPO_URL="https://github.com/yourusername/vincio-chat.git"  # Update this
DOMAIN="your-domain.com"  # Update this

# Create directories
mkdir -p /home/vincio/logs
mkdir -p $APP_DIR

# Clone or update repository
if [ -d "$APP_DIR/.git" ]; then
    echo "📦 Updating existing repository..."
    cd $APP_DIR
    git pull origin main
else
    echo "📦 Cloning repository..."
    git clone $REPO_URL $APP_DIR
    cd $APP_DIR
fi

# Install dependencies
echo "📚 Installing dependencies..."
npm ci --only=production

# Copy environment file
if [ ! -f "$APP_DIR/.env" ]; then
    echo "⚠️  Please create your .env file at $APP_DIR/.env"
    echo "📋 Use the template provided and update with your secure values"
    exit 1
fi

# Generate secure secrets if not set
echo "🔐 Checking environment secrets..."
if grep -q "change-this" $APP_DIR/.env; then
    echo "⚠️  WARNING: Default secrets detected in .env file!"
    echo "🔧 Generating secure secrets..."
    
    # Generate secure random secrets
    TOKEN_SECRET=$(openssl rand -hex 32)
    CSRF_SECRET=$(openssl rand -hex 32)
    HASH_SALT=$(openssl rand -hex 16)
    SECRET_KEY=$(openssl rand -hex 32)
    
    # Update .env file
    sed -i "s/your-super-secure-token-secret-change-this-immediately/$TOKEN_SECRET/" $APP_DIR/.env
    sed -i "s/your-csrf-secret-key-change-this-too/$CSRF_SECRET/" $APP_DIR/.env
    sed -i "s/your-privacy-hash-salt-change-this-as-well/$HASH_SALT/" $APP_DIR/.env
    sed -i "s/your-encryption-secret-key-change-this-also/$SECRET_KEY/" $APP_DIR/.env
    
    echo "✅ Secure secrets generated and applied!"
fi

# Set up PM2
echo "🔄 Setting up PM2..."
pm2 delete vincio-chat 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup | grep -E '^sudo' | bash

# Configure Nginx
echo "🌐 Configuring Nginx..."
sudo cp /tmp/vincio-chat-nginx.conf /etc/nginx/sites-available/vincio-chat
sudo ln -sf /etc/nginx/sites-available/vincio-chat /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t

# Get SSL certificate
echo "🔒 Setting up SSL certificate..."
sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

# Start services
echo "🚀 Starting services..."
sudo systemctl reload nginx
sudo systemctl enable vincio-chat
sudo systemctl start vincio-chat

# Check status
echo "📊 Checking service status..."
pm2 status
sudo systemctl status nginx --no-pager -l

echo ""
echo "✅ Deployment complete!"
echo "🌐 Your Vincio Chat is now available at: https://$DOMAIN"
echo "📊 Monitor with: pm2 monit"
echo "📝 View logs with: pm2 logs vincio-chat"
echo ""
echo "🔧 Post-deployment checklist:"
echo "  1. Test the application in your browser"
echo "  2. Check encryption is working properly"
echo "  3. Verify rate limiting is active"
echo "  4. Test WebSocket connections"
echo "  5. Monitor memory usage with: pm2 monit"