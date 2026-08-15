#!/usr/bin/env python3
"""SafePrint Security Verification Suite (promotional demo).

This is a SCRIPTED VISUAL DEMO for marketing/presentation videos only.
It does NOT perform real security testing — every result is hard-coded.
The check names mirror SafePrint's real security features (TLS/ChaCha20,
digital signatures, GCash payment verification, ClamAV scanning, and
automatic document deletion) so the animation looks authentic on screen.
"""

import random
import sys
import time

GREEN = "\033[92m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
GREY = "\033[90m"
WHITE = "\033[97m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

CHECKS = [
    ("TLS 1.3 handshake", "ECDHE-RSA-CHACHA20-POLY1305", "9 ms"),
    ("X.509 certificate + digital signature", "SHA-256 RSA · chain valid", "OK"),
    ("ChaCha20-Poly1305 document encryption", "AEAD auth tag verified", "OK"),
    ("Payload integrity / tamper detection", "0 bytes altered", "OK"),
    ("GCash payment verification", "Firestore token authenticated", "OK"),
    ("ClamAV upload malware scan", "0 threats · signatures current", "OK"),
    ("Automatic document deletion", "retention policy enforced", "OK"),
    ("Admin isolation + CSRF / Secure cookies", "content access denied", "OK"),
]


def w(text):
    sys.stdout.write(text)
    sys.stdout.flush()


def type_out(text, delay=0.014):
    for ch in text:
        w(ch)
        time.sleep(delay)
    w("\n")


def run():
    w("\033[2J\033[H")  # clear screen
    w(f"{DIM}safeprint@vendo{RESET}:{CYAN}~/SafePrint{RESET}$ ")
    time.sleep(0.2)
    type_out(f"{WHITE}python3 verify_security.py{RESET}")
    time.sleep(0.15)

    w("\n")
    w(f"{BOLD}{CYAN}  ╔══════════════════════════════════════════════════════════╗{RESET}\n")
    w(f"{BOLD}{CYAN}  ║   SafePrint · Security Verification Suite   v1.0         ║{RESET}\n")
    w(f"{BOLD}{CYAN}  ╚══════════════════════════════════════════════════════════╝{RESET}\n")
    time.sleep(0.25)
    w(f"{GREY}  Running privacy & security integrity checks...{RESET}\n\n")
    time.sleep(0.2)

    label_w = 44
    passed = 0
    for label, detail, metric in CHECKS:
        line = f"  {label.ljust(label_w)}"
        for _ in range(random.randint(4, 7)):
            w(f"\r{CYAN}{random.choice(SPINNER)}{RESET}{line}{GREY}running{RESET}   ")
            time.sleep(0.045)
        w(f"\r{GREEN}{BOLD}✓{RESET}{line}{GREEN}{BOLD}PASS{RESET}  {GREY}{detail} · {metric}{RESET}\033[K\n")
        passed += 1
        time.sleep(0.06)

    total = len(CHECKS)
    time.sleep(0.2)
    w("\n")
    w(f"{GREEN}{BOLD}  ────────────────────────────────────────────────────────────{RESET}\n")
    w(
        f"{GREEN}{BOLD}  ✓ SECURITY AUDIT COMPLETE   {passed}/{total} CHECKS PASSED{RESET}"
        f"   {GREY}(0 warnings, 0 failures){RESET}\n"
    )
    w(f"{GREEN}{BOLD}  🔒 SafePrint system verified SECURE{RESET}   {GREY}· data encrypted end-to-end{RESET}\n")
    w(f"{GREEN}{BOLD}  ────────────────────────────────────────────────────────────{RESET}\n")
    time.sleep(0.4)


if __name__ == "__main__":
    run()
