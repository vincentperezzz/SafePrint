#!/bin/bash

# Wait for Tailscale service to be fully up
sleep 30

# Configure Tailscale with subnet routing and as an exit node
/usr/bin/tailscale up --advertise-exit-node --accept-routes --advertise-routes=192.168.0.0/24

# Log the action
echo "$(date): Tailscale configured as exit node with subnet routes" >> /var/log/tailscale-startup.log
