#!/bin/bash
# Usage: duckdns-auth.sh DOMAIN TOKEN

DOMAIN="nanoprint"
TOKEN="***REMOVED_DUCKDNS_TOKEN***"
TXT_VALUE="$CERTBOT_VALIDATION"

curl "https://www.duckdns.org/update?domains=${DOMAIN}&token=${TOKEN}&txt=${TXT_VALUE}&verbose=true&clear=false"
sleep 1800  # Wait for DNS propagation (adjust as needed)