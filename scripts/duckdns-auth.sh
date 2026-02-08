#!/bin/bash
# Usage: duckdns-auth.sh DOMAIN TOKEN

DOMAIN="safeprint"
TOKEN="71169366-fe79-4ed6-8aa2-429a100c7898"
TXT_VALUE="$CERTBOT_VALIDATION"

curl "https://www.duckdns.org/update?domains=${DOMAIN}&token=${TOKEN}&txt=${TXT_VALUE}&verbose=true&clear=false"
sleep 120  # Wait for DNS propagation (DuckDNS usually propagates in under 60s)