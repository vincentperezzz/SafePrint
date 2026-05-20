# SafePrint Topology Implementation Plan For Codex

## Purpose

This document gives Codex the correct context for the live SafePrint network so it does not implement against the older simplified topology diagram.

The NetAcad-style diagram shows one router in the middle, but the live setup is different:

- MikroTik is the actual router, DHCP server, subnet divider, DNS forwarder, and captive portal hotspot host.
- TP-Link is only a Wi-Fi broadcaster/access point for clients.
- The Ubuntu SafePrint server and the printers live on the infrastructure subnet.
- The Ubuntu SafePrint server is not the physical hub for printers; it is only another host on the SafePrint infrastructure subnet.
- Customer devices live on a separate client subnet behind the MikroTik hotspot.

Codex should treat this as a dual-segment network with one real L3 gateway and one L2/AP device.

## Current Intended Topology

### Segment A: Infrastructure / Printer LAN

- Subnet: `192.168.0.0/24`
- Gateway / router interface: MikroTik on the printer-side LAN
- SafePrint Ubuntu server: `192.168.0.100`
- Printers: static IPs such as `192.168.0.101` to `192.168.0.105`
- Physical attachment: the server and printers are peers on the same MikroTik-managed SafePrint subnet; printers may join that subnet wirelessly, but they are not connected through the Ubuntu server.
- Purpose:
  - Django / Gunicorn / Nginx app hosting
  - CUPS printing
  - SNMP polling
  - Firebase-backed payment verification
  - Pi-hole or DNS-related services hosted on the server

## Corrected Physical Topology Sketch

Use this model instead of any sketch that places the printers under the Ubuntu server:

```text
┌─────────────────────────┐
│     Customer Devices    │
│ Phones / Tablets / PCs │
└──────────┬──────────────┘
     │ Wi-Fi
     ▼
┌─────────────────────────┐
│       TP-Link AP        │
│   (Access Point Only)   │
└──────────┬──────────────┘
     │ Bridge
     ▼
┌─────────────────────────┐
│        MikroTik         │
│ Router + DHCP + DNS     │
│ Hotspot + Captive Portal│
└───────┬────────┬────────┘
  │        │
  │        └──────────── SafePrint infrastructure subnet `192.168.0.0/24`
  │
  └───────────────────── Customer subnet `172.16.0.0/24`

    SafePrint infrastructure subnet peers:

  ┌──────────────────────────────────────────────────────┐
  │ Ubuntu SafePrint Server      192.168.0.100          │
  │ Printer 1                    192.168.0.101          │
  │ Printer 2                    192.168.0.102          │
  │ Printer 3                    192.168.0.103          │
  │ Printer 4                    192.168.0.104          │
  │ Printer 5                    192.168.0.105          │
  └──────────────────────────────────────────────────────┘
```

The important correction is physical and logical:

- the Ubuntu server communicates with the printers, but it does not sit in-between them as a network switch or gateway
- the printers belong to the SafePrint infrastructure subnet controlled by the MikroTik
- if printers are connected wirelessly, that still makes them peers on the same infrastructure subnet, not children of the server

### Segment B: Customer / Captive LAN

- Subnet: `172.16.0.0/24`
- Gateway: MikroTik client-side bridge or hotspot interface
- Common client entry point: `172.16.0.1`
- Clients: phones and laptops via DHCP
- Purpose:
  - customer onboarding through captive portal
  - access to SafePrint web app after hotspot login
  - isolation from the printer LAN except for explicitly allowed flows

### Device Roles

#### MikroTik

MikroTik is the core network controller. Codex should assume it owns:

- inter-subnet routing between client and infrastructure networks
- DHCP for the client network
- hotspot / captive portal on the client-facing bridge
- DNS handoff for clients
- NAT or srcnat rules needed for DNS forwarding or internet access behavior
- policy boundaries between customer devices and printers/server

#### TP-Link

TP-Link is not the routing brain. Codex should assume it is:

- AP mode only
- no DHCP
- no NAT
- no captive portal logic
- no subnet ownership
- only broadcasting the SSID and bridging wireless clients toward the MikroTik-controlled client network

#### Ubuntu SafePrint Server

The server should remain on the infrastructure LAN and provides:

- Django application
- Gunicorn + Nginx
- CUPS queues mapped to network printers
- printer monitoring
- payment verification and Firebase reconciliation
- DuckDNS / HTTPS endpoint for the SafePrint app

## Known Live Network Facts From Repo Context

These facts are already reflected in the repo and should be preserved:

- client hotspot subnet is `172.16.0.0/24`
- infrastructure subnet is `192.168.0.0/24`
- SafePrint server is `192.168.0.100`
- hotspot entry / manual captive URL is `http://172.16.0.1/login`
- captive status page is `http://172.16.0.1/status`
- RouterOS hotspot is deployed on the MikroTik client bridge as `safeprint-clients`
- RouterOS hotspot login page redirects users to `https://safeprint.duckdns.org/`
- MikroTik hands out DNS `172.16.0.1` to clients and forwards upstream DNS behavior toward the server side
- client-facing captive portal assets in this repo already assume the MikroTik hotspot flow

## What Is Wrong With The Old Diagram

The old diagram is acceptable as a classroom simplification, but it is wrong for implementation if it implies any of the following:

- TP-Link and MikroTik are both routing
- TP-Link owns a separate subnet
- captive portal is hosted by the TP-Link
- customers and printers share the same flat LAN
- the single center router in the picture represents the whole live control plane

For implementation, Codex must instead model:

- one real router and hotspot platform: MikroTik
- one wireless access layer device: TP-Link
- one infra LAN for printers and server
- one client LAN for hotspot users

## Target Documentation Outcome

Codex should update or create documentation so the project clearly shows:

1. The logical topology.
2. The physical device roles.
3. The IP plan.
4. The traffic flow from customer device to captive portal to SafePrint app.
5. The separation between customer access and printer operations.

## Recommended Codex Work Plan

### Phase 1: Normalize The Source Of Truth

Codex should first create a single source-of-truth network section in the docs.

Deliverables:

- a corrected topology description
- an IP addressing table
- a device-role table
- a note explaining that the TP-Link is AP-only

Suggested details to include:

- `MikroTik = router + DHCP + hotspot + subnet boundary`
- `TP-Link = AP / broadcaster only`
- `Server = 192.168.0.100`
- `Clients = 172.16.0.0/24`
- `Printers = 192.168.0.0/24`

### Phase 2: Map Traffic Flow End To End

Codex should describe the real operational path:

1. Customer joins the TP-Link-broadcasted SSID.
2. Wireless traffic bridges to the MikroTik-controlled client segment.
3. MikroTik gives the client an address in `172.16.0.0/24`.
4. MikroTik hotspot intercepts the client and serves the captive portal.
5. After login, the client is redirected to `https://safeprint.duckdns.org/`.
6. The SafePrint server handles uploads, payment, and queueing.
7. The server talks to printers on `192.168.0.0/24` via CUPS and monitoring tools.

This should be documented as the canonical flow.

### Phase 3: Separate Logical And Physical Views

Codex should avoid a single ambiguous diagram.

It should produce two views:

- Physical view:
  - MikroTik as the infrastructure hub for both the Ubuntu server and all printers
  - printers documented as peers of the Ubuntu server on the SafePrint subnet, even if some printer links are wireless
  - TP-Link connected as AP for customers
- Logical view:
  - Client subnet `172.16.0.0/24`
  - Infrastructure subnet `192.168.0.0/24`
  - policy/control boundary at MikroTik

### Phase 4: Align Repo Docs With Existing Captive Portal Code

Codex should cross-reference the network docs with the existing captive portal files in this repo:

- `captive-portal/login.html`
- `captive-portal/rlogin.html`
- `captive-portal/redirect.html`
- `captive-portal/status.html`

These files already assume:

- hotspot login handled by RouterOS variables
- client-side captive access through `172.16.0.1`
- post-login flow into the SafePrint HTTPS site

The documentation should explicitly say that these pages belong to the MikroTik hotspot flow, not to TP-Link.

### Phase 5: Define Configuration Boundaries

Codex should document which settings belong to which device.

#### MikroTik-owned configuration

- hotspot configuration
- DHCP scope for `172.16.0.0/24`
- bridge or client interface settings
- DNS forwarding behavior for clients
- firewall or NAT rules between client and infra networks
- redirect behavior into SafePrint

#### TP-Link-owned configuration

- SSID broadcast
- AP mode only
- radio settings / channel / security
- uplink to MikroTik

#### Ubuntu server-owned configuration

- SafePrint web app
- Nginx / Gunicorn
- DuckDNS / TLS endpoint
- CUPS queues
- printer polling
- Firebase payment verification services

### Phase 6: Add Validation Steps

Codex should include validation steps so the topology can be verified after documentation or implementation work.

Minimum validation checklist:

1. A client joining Wi-Fi receives an IP in `172.16.0.0/24`.
2. The client gateway is `172.16.0.1`.
3. The captive portal opens on the MikroTik hotspot.
4. Post-login redirect reaches `https://safeprint.duckdns.org/`.
5. The SafePrint server remains reachable on `192.168.0.100` from the infrastructure side.
6. Printers remain reachable from the server on `192.168.0.0/24`.
7. Customer clients do not directly bypass the hotspot or printer separation.

## Constraints Codex Must Respect

- Do not redesign the network into a flat single subnet.
- Do not assign routing, DHCP, or hotspot responsibilities to the TP-Link.
- Do not move printers into the client subnet.
- Do not make the SafePrint server depend on direct client-LAN residence.
- Do not draw or describe the printers as being downstream of the Ubuntu server.
- Do not document the old single-router drawing as the authoritative live topology.

## Implementation Priority For Codex

If Codex is asked to update docs or configs, it should prioritize work in this order:

1. Correct the architecture description.
2. Correct the topology diagram text and labels.
3. Add an IP/device-role matrix.
4. Tie the captive portal docs to MikroTik.
5. Add a validation checklist for real deployment.

## Suggested Output Format For Codex

Codex should ideally produce:

- one updated network architecture markdown document
- one corrected Mermaid diagram or ASCII diagram
- one short section in deployment docs that states the live device roles
- optional appendix for RouterOS and TP-Link configuration boundaries

## Codex Prompt Seed

Use this as the starting instruction for Codex:

> Update the SafePrint network documentation to reflect the live topology, not the simplified NetAcad diagram. The real setup has two network devices but only one real router: MikroTik is the router, DHCP server, captive portal hotspot host, DNS handoff point, and subnet boundary between the client subnet `172.16.0.0/24` and the infrastructure/printer subnet `192.168.0.0/24`. The TP-Link is only an access point/broadcaster and should be documented as AP-only with no routing, DHCP, NAT, or captive logic. The SafePrint server stays on `192.168.0.100`, printers stay on `192.168.0.x`, and customers receive `172.16.0.x` addresses through the MikroTik hotspot. Update the docs so they explain device roles, IP plan, traffic flow, captive portal flow, and validation steps. Cross-reference the existing `captive-portal/*.html` files as part of the MikroTik hotspot flow.

> In the physical topology, do not draw printers beneath the Ubuntu server. The server and printers are peer devices on the MikroTik-managed SafePrint infrastructure subnet. If the printers join that subnet wirelessly, document them as wireless peers of the MikroTik infrastructure network, not as devices connected through the server.
