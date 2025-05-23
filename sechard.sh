#!/bin/bash
# security-hardening.sh - Run as root

echo "🔒 Starting security hardening for Vincio Chat..."

# 1. Configure fail2ban
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = 22
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 3600

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 3600
EOF

# 2. Configure automatic security updates
echo 'Unattended-Upgrade::Automatic-Reboot "false";' >> /etc/apt/apt.conf.d/50unattended-upgrades
echo 'Unattended-Upgrade::Remove-Unused-Dependencies "true";' >> /etc/apt/apt.conf.d/50unattended-upgrades

# 3. System limits for the vincio user
cat > /etc/security/limits.d/vincio.conf << EOF
vincio soft nofile 65536
vincio hard nofile 65536
vincio soft nproc 32768
vincio hard nproc 32768
EOF

# 4. Kernel security parameters
cat > /etc/sysctl.d/99-security.conf << EOF
# Network security
net.ipv4.conf.default.rp_filter=1
net.ipv4.conf.all.rp_filter=1
net.ipv4.tcp_syncookies=1
net.ipv4.ip_forward=0
net.ipv6.conf.all.forwarding=0
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv6.conf.all.accept_redirects=0
net.ipv6.conf.default.accept_redirects=0
net.ipv4.conf.all.secure_redirects=0
net.ipv4.conf.default.secure_redirects=0
net.ipv4.conf.all.send_redirects=0
net.ipv4.conf.default.send_redirects=0
net.ipv4.conf.all.accept_source_route=0
net.ipv4.conf.default.accept_source_route=0
net.ipv6.conf.all.accept_source_route=0
net.ipv6.conf.default.accept_source_route=0

# Memory protection
kernel.dmesg_restrict=1
kernel.kptr_restrict=2
kernel.yama.ptrace_scope=1

# File system security
fs.protected_hardlinks=1
fs.protected_symlinks=1
fs.suid_dumpable=0
EOF

# 5. Apply sysctl settings
sysctl -p /etc/sysctl.d/99-security.conf

# 6. Set up log rotation for the app
cat > /etc/logrotate.d/vincio-chat << EOF
/home/vincio/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    notifempty
    create 0644 vincio vincio
    postrotate
        /usr/bin/pm2 reloadLogs
    endscript
}
EOF

# 7. Create systemd service for PM2
cat > /etc/systemd/system/vincio-chat.service << EOF
[Unit]
Description=Vincio Chat Application
After=network.target

[Service]
Type=forking
User=vincio
Group=vincio
WorkingDirectory=/home/vincio/vincio-chat
ExecStart=/usr/bin/pm2 start ecosystem.config.js --env production
ExecReload=/usr/bin/pm2 reload ecosystem.config.js --env production
ExecStop=/usr/bin/pm2 stop ecosystem.config.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 8. Enable services
systemctl enable fail2ban
systemctl enable nginx
systemctl enable vincio-chat
systemctl enable unattended-upgrades

# 9. Start fail2ban
systemctl start fail2ban

echo "✅ Security hardening complete!"
echo "🔄 Please reboot the system to apply all changes."