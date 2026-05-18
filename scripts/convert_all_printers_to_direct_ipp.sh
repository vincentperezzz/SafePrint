#!/bin/bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this script with sudo or as root."
    exit 1
fi

PROJECT_DIR="/home/safeprint/dev/SafePrint"
BACKUP_DIR="${PROJECT_DIR}/logs"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/cups_direct_ipp_backup_${TIMESTAMP}.txt"

mkdir -p "${BACKUP_DIR}"

declare -A QUEUE_TO_IP=(
    [Brother_DCP_T430W_f44eb4af179d]="192.168.0.101"
    [Brother_DCP_T430W_44f79f1a6f27]="192.168.0.102"
    [Brother_DCP_T430W_f44eb475ac2a]="192.168.0.103"
    [Brother_DCP_T430W_44f79f1a71f1]="192.168.0.104"
    [Brother_DCP_T430W_44f79f1a7567]="192.168.0.105"
)

echo "Saving current CUPS queue snapshot to ${BACKUP_FILE}"
{
    echo "# Before direct IPP conversion"
    echo "# Generated: $(date -Is)"
    echo
    lpstat -v || true
    echo
    for queue in "${!QUEUE_TO_IP[@]}"; do
        echo "== ${queue} =="
        lpstat -l -p "${queue}" || true
        lpoptions -p "${queue}" || true
        echo
    done
} > "${BACKUP_FILE}"

for queue in "${!QUEUE_TO_IP[@]}"; do
    ip="${QUEUE_TO_IP[$queue]}"
    uri="ipp://${ip}:631/ipp/print"

    echo
    echo "[CHECK] ${queue} -> ${uri}"
    ipptool -tv "${uri}" get-printer-attributes.test | grep -q 'successful-ok'

    echo "[CONVERT] ${queue} -> ${uri}"
    lpadmin -p "${queue}" -E -v "${uri}" -m everywhere
    lpadmin -p "${queue}" -o printer-is-shared=true
    cupsaccept "${queue}"
    cupsenable "${queue}"

    echo "[VERIFY] ${queue}"
    lpstat -v "${queue}"
    lpstat -p "${queue}" -l
done

echo
echo "Direct IPP conversion finished for the five mapped printer queues."
echo "The generic Brother_DCP_T430W class queue was left unchanged because it is not tied to a single device."
echo "Backup saved to ${BACKUP_FILE}"