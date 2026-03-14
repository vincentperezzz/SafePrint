"""
Email Notification Service for SafePrint

Sends email alerts to admin users for critical system events:
- Printer offline
- Paper tray needs refill
- Ink low
- New support ticket submitted
- KLCiS login failure
- Document stuck in printing

Uses Django's built-in email system with Gmail SMTP.
Includes 30-minute cooldown per event type + printer to prevent spam.
"""

import logging
import threading
import time
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Cooldown tracking: {event_key: last_sent_timestamp}
_cooldown_cache = {}
_cooldown_lock = threading.Lock()

# 30 minutes in seconds
COOLDOWN_SECONDS = 30 * 60


def _cooldown_key(event_type, identifier=''):
    """Generate a unique key for cooldown tracking."""
    return f"{event_type}:{identifier}"


def _is_on_cooldown(event_type, identifier=''):
    """Check if an event is still on cooldown (sent within last 30 min)."""
    key = _cooldown_key(event_type, identifier)
    with _cooldown_lock:
        last_sent = _cooldown_cache.get(key)
        if last_sent and (time.time() - last_sent) < COOLDOWN_SECONDS:
            return True
        return False


def _mark_sent(event_type, identifier=''):
    """Record that an alert was just sent for cooldown tracking."""
    key = _cooldown_key(event_type, identifier)
    with _cooldown_lock:
        _cooldown_cache[key] = time.time()


def _get_admin_emails():
    """Fetch all admin emails that are non-empty."""
    from portal.models import AdminUser
    emails = list(
        AdminUser.objects.exclude(email__isnull=True)
        .exclude(email='')
        .values_list('email', flat=True)
    )
    return emails


def notify_admins(subject, message, event_type='general', identifier='', force=False):
    """
    Send an email alert to all admin users with non-empty email addresses.
    
    Args:
        subject: Email subject line
        message: Email body (plain text)
        event_type: Category for cooldown tracking (e.g., 'printer_offline')
        identifier: Specific item (e.g., printer name) for per-item cooldown
        force: If True, bypass cooldown
    
    Returns:
        True if email was sent, False if skipped (cooldown/no recipients/error)
    """
    if not force and _is_on_cooldown(event_type, identifier):
        logger.debug(f"Email alert skipped (cooldown): {event_type}:{identifier}")
        return False

    recipients = _get_admin_emails()
    if not recipients:
        logger.warning("No admin email addresses configured — alert not sent")
        return False

    if not settings.EMAIL_HOST_USER:
        logger.warning("EMAIL_HOST_USER not configured — alert not sent")
        return False

    try:
        send_mail(
            subject=f"[SafePrint] {subject}",
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipients,
            fail_silently=False,
        )
        _mark_sent(event_type, identifier)
        logger.info(f"Email alert sent: {subject} → {recipients}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email alert: {e}")
        return False


# ─── Specific Alert Functions ────────────────────────────────────────

def alert_printer_offline(printer_name, ip_address):
    """Alert: Printer went offline."""
    notify_admins(
        subject=f"Printer Offline: {printer_name}",
        message=(
            f"Printer '{printer_name}' at IP {ip_address} is now OFFLINE.\n\n"
            f"Time: {timezone.now().strftime('%Y-%m-%d %I:%M %p')}\n\n"
            f"Please check the printer's power and network connection."
        ),
        event_type='printer_offline',
        identifier=printer_name,
    )


def alert_paper_refill(printer_name, tray_level):
    """Alert: Paper tray needs refill."""
    notify_admins(
        subject=f"Paper Refill Needed: {printer_name}",
        message=(
            f"Printer '{printer_name}' paper tray is '{tray_level}'.\n\n"
            f"Time: {timezone.now().strftime('%Y-%m-%d %I:%M %p')}\n\n"
            f"Please refill the paper tray to avoid print queue delays."
        ),
        event_type='paper_refill',
        identifier=printer_name,
    )


def alert_ink_low(printer_name, ink_status):
    """Alert: Ink is low on one or more cartridges."""
    color_map = {'b': 'Black', 'y': 'Yellow', 'c': 'Cyan', 'm': 'Magenta'}
    low_colors = [color_map.get(c, c) for c in ink_status]
    colors_text = ', '.join(low_colors)

    notify_admins(
        subject=f"Ink Low: {printer_name}",
        message=(
            f"Printer '{printer_name}' has low ink on: {colors_text}\n\n"
            f"Time: {timezone.now().strftime('%Y-%m-%d %I:%M %p')}\n\n"
            f"Please replace the affected cartridge(s) soon."
        ),
        event_type='ink_low',
        identifier=printer_name,
    )


def alert_new_ticket(ticket_number, customer_name, problem_type, description):
    """Alert: New support ticket submitted by a student."""
    notify_admins(
        subject=f"New Support Ticket: {ticket_number}",
        message=(
            f"A new support ticket has been submitted.\n\n"
            f"Ticket:  {ticket_number}\n"
            f"Student: {customer_name}\n"
            f"Type:    {problem_type}\n"
            f"Issue:   {description}\n\n"
            f"Time: {timezone.now().strftime('%Y-%m-%d %I:%M %p')}\n\n"
            f"Please review the ticket in the admin dashboard."
        ),
        event_type='new_ticket',
        identifier=ticket_number,
    )


def alert_klcis_failure(error_message):
    """Alert: KLCiS payment gateway login/session failure."""
    notify_admins(
        subject="KLCiS Connection Failure",
        message=(
            f"The KLCiS payment gateway connection has failed.\n\n"
            f"Error: {error_message}\n\n"
            f"Time: {timezone.now().strftime('%Y-%m-%d %I:%M %p')}\n\n"
            f"Payment processing is currently unavailable. "
            f"Please check the KLCiS credentials in .env or visit "
            f"the KLCiS dashboard manually."
        ),
        event_type='klcis_failure',
        identifier='klcis',
    )


def alert_document_stuck(doc_id, customer_id, printer_name, minutes_stuck):
    """Alert: Document has been stuck in 'Printing' status too long."""
    notify_admins(
        subject=f"Document Stuck: {doc_id}",
        message=(
            f"Document '{doc_id}' for customer {customer_id} has been stuck "
            f"in 'Printing' status for {minutes_stuck} minutes on printer "
            f"'{printer_name}'.\n\n"
            f"Time: {timezone.now().strftime('%Y-%m-%d %I:%M %p')}\n\n"
            f"This may indicate a printer jam or error. Please check the printer."
        ),
        event_type='document_stuck',
        identifier=doc_id,
    )
