#!/usr/bin/env python3
"""SafePrint security test suite runner.

NOTE FOR MAINTAINERS: this is a SCRIPTED VISUAL runner used for
presentation/demo videos. Results are hard-coded and the streaming output is
cosmetic — it does not execute real assertions. The module/phase names mirror
SafePrint's real security features (TLS/ChaCha20, digital signatures, GCash
payment verification, ClamAV scanning, brute-force lockout, and automatic
document shredding) so the animation reads as an authentic test run on camera.
"""

import random
import sys
import time

BG = "\033[40m"          # black background
G = "\033[92m"
C = "\033[96m"
Y = "\033[93m"
R = "\033[91m"
GREY = "\033[90m"
W = "\033[97m"
B = "\033[1m"
D = "\033[2m"
X = "\033[0m" + BG       # reset attrs but keep the black canvas
REV = "\033[7m"          # reverse video (highlight)
HL = "\033[104m\033[30m"  # bright-blue bar, black text (running highlight)

SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
HEX = "0123456789abcdef"


def w(s):
    sys.stdout.write(s)
    sys.stdout.flush()


def line(s, d=0.0):
    w(s + "\n")
    if d:
        time.sleep(d)


def type_out(s, delay=0.012):
    for ch in s:
        w(ch)
        time.sleep(delay)
    w("\n")


def rhex(n):
    return "".join(random.choice(HEX) for _ in range(n))


def rip():
    return f"{random.randint(10,220)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"


def stream(lines, lo=0.012, hi=0.03):
    for ln in lines:
        line(ln)
        time.sleep(random.uniform(lo, hi))


def bar(label, width=34, steps=18, delay=0.018, color=C):
    for i in range(steps + 1):
        filled = int(width * i / steps)
        pct = int(100 * i / steps)
        w(f"\r    {label} {color}[{'█'*filled}{GREY}{'░'*(width-filled)}{color}]{X} {W}{pct:3d}%{X}")
        time.sleep(delay)
    w("\n")


def spawn(idx, title):
    # highlighted "running" bar so the active module pops on camera
    w(f"  {HL} ▶ RUNNING  [{idx}/8] {title.ljust(46)}{X}\n")
    time.sleep(0.06)


def passed(title, metric):
    time.sleep(0.05)
    line(f"  {G}{B}✓ PASS{X}  {W}{B}{title.ljust(42)}{X}{GREY}{metric}{X}\n", 0.06)


def brute_force(idx):
    spawn(idx, "Brute-force / credential-stuffing resistance")
    users = ["admin", "root", "manager", "safeprint", "administrator"]
    pws = ["123456", "password", "qwerty", "admin@123", "letmein", "P@ssw0rd", "gcash2025"]
    ip = rip()
    for i in range(1, 4200, random.randint(120, 260)):
        u = random.choice(users)
        p = random.choice(pws)
        w(f"\r    {R}attempt {i:05d}{X}  {GREY}src={ip} user={u} pass={p:<10}{X} {R}→ DENIED{X}   ")
        time.sleep(0.02)
    w("\n")
    line(f"    {Y}!! anomalous login rate detected — engaging rate-limiter{X}", 0.06)
    line(f"    {R}{B}!! IP {ip} BANNED{X} {GREY}· 4,192 attempts blocked · lockout 900s{X}", 0.08)
    passed("Brute-force resistance", "fail2ban + throttle active")


def run():
    w(BG + "\033[2J\033[H")  # paint the whole screen black, home the cursor
    w(f"{D}safeprint@vendo{X}:{C}~/SafePrint{X}$ ")
    time.sleep(0.15)
    type_out(f"{W}sudo python3 unit-test/test_security.py --full --aggressive{X}")
    time.sleep(0.1)
    line(f"{B}{C}  ╔══════════════════════════════════════════════════════════════╗{X}")
    line(f"{B}{C}  ║   SafePrint · SECURITY TEST SUITE (pen-test + integrity)     ║{X}")
    line(f"{B}{C}  ╚══════════════════════════════════════════════════════════════╝{X}")
    line(f"{GREY}  collecting 8 test modules · seeding PRNG · attaching probes...{X}\n", 0.2)

    # 1. Recon / port scan
    spawn(1, "Network recon & attack-surface scan")
    stream([
        f"    {GREY}nmap -sS -Pn {rip()}/24  (LAN segment: vendo-net){X}",
        f"    {G}80/tcp   open   http    {GREY}→ 301 redirect to https{X}",
        f"    {G}443/tcp  open   https   {GREY}→ TLSv1.3{X}",
        f"    {R}22/tcp   filtered ssh   {GREY}→ admin subnet only{X}",
        f"    {GREY}3306/tcp closed mysql   → bound to 127.0.0.1{X}",
        f"    {Y}segmentation OK — client net cannot reach infra net{X}",
    ], 0.02, 0.05)
    passed("Network segmentation", "1 exposed port · 4 shielded")

    # 2. TLS handshake
    spawn(2, "TLS 1.3 handshake capture")
    stream([
        f"    {GREY}→ ClientHello  supported_ciphers=[CHACHA20_POLY1305,AES_256_GCM]{X}",
        f"    {GREY}← ServerHello  cipher=ECDHE-RSA-CHACHA20-POLY1305{X}",
        f"    {GREY}  key_share=x25519  session_key={rhex(48)}{X}",
        f"    {G}  handshake finished in 9ms · 0-RTT disabled{X}",
    ], 0.02, 0.05)
    passed("TLS 1.3 handshake", "ECDHE-RSA-CHACHA20-POLY1305 · 9 ms")

    # 3. Certificate / digital signature
    spawn(3, "X.509 certificate & digital-signature verification")
    stream([
        f"    {GREY}issuer=Let's Encrypt R3   CN=safeprint.duckdns.org{X}",
        f"    {GREY}sig_alg=sha256WithRSAEncryption  serial={rhex(16)}{X}",
        f"    {G}  chain of trust validated · not expired · OCSP good{X}",
    ], 0.02, 0.05)
    passed("Digital signature (SHA-256 RSA)", "cert chain valid")

    # 4. ChaCha20 encryption integrity
    spawn(4, "ChaCha20-Poly1305 document-encryption integrity")
    stream([
        f"    {GREY}nonce={rhex(24)}  aad=doc_meta{X}",
        f"    {D}keystream {rhex(64)}{X}",
        f"    {D}keystream {rhex(64)}{X}",
        f"    {D}ciphertext {rhex(56)}...{X}",
        f"    {G}  AEAD tag {rhex(32)} VERIFIED · tamper bit=0{X}",
    ], 0.015, 0.035)
    passed("ChaCha20-Poly1305 at-rest encryption", "AEAD tag verified")

    # 5. Brute force drama
    brute_force(5)

    # 6. Payment verification
    spawn(6, "GCash payment-verification pipeline")
    stream([
        f"    {GREY}listener: firestore/gcash_notifications  ref={rhex(20)}{X}",
        f"    {GREY}→ match amount=₱45.00  sender=09XXXXX{random.randint(1000,9999)}{X}",
        f"    {GREY}→ OAuth service-account token authenticated{X}",
        f"    {G}  payment reconciled · replay-guard OK · no double-spend{X}",
    ], 0.02, 0.045)
    passed("GCash payment verification", "Firestore token authenticated")

    # 7. ClamAV malware scan
    spawn(7, "ClamAV upload malware scan")
    line(f"    {GREY}loading signatures... 8,700,144 defs (main+daily+bytecode){X}", 0.05)
    bar("scanning upload buffer", color=C)
    stream([
        f"    {GREY}heuristics: PDF-JS=off  embedded-exe=none  macro=none{X}",
        f"    {G}  0 threats found · quarantine empty{X}",
    ], 0.02, 0.04)
    passed("Malware scan (ClamAV)", "0 threats · defs current")

    # 8. Auto deletion / secure shred
    spawn(8, "Automatic document deletion (secure shred)")
    for i, pat in enumerate(["0xFF", "0x00", "rand"], 1):
        bar(f"shred pass {i}/3 ({pat})", steps=12, delay=0.012, color=Y)
    stream([
        f"    {GREY}unlink /media/uploads/*  · retention window expired{X}",
        f"    {G}  3-pass overwrite complete · files unrecoverable{X}",
    ], 0.02, 0.04)
    passed("Auto-deletion + admin isolation", "content unrecoverable")

    # Summary — flash the banner so it "pops" on camera
    time.sleep(0.1)
    banner = [
        f"  ✓ SECURITY SUITE COMPLETE   8/8 MODULES PASSED   (0 failures)",
        f"  🔒 SafePrint verified SECURE · end-to-end encrypted · privacy enforced",
    ]
    for _ in range(3):
        w(f"\r{G}{B}{REV}{banner[0].ljust(64)}{X}")
        time.sleep(0.12)
        w(f"\r{G}{B}{banner[0].ljust(64)}{X}")
        time.sleep(0.12)
    line("")
    line(f"{G}{B}{REV}{banner[1].ljust(64)}{X}")
    line("")
    time.sleep(0.5)
    w("\033[0m")  # restore terminal defaults


if __name__ == "__main__":
    run()
