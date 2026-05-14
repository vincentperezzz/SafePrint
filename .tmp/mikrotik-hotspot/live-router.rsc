# may/14/2026 15:05:56 by RouterOS 6.49.13
# software id = 1MWM-N6T1
#
# model = RB941-2nD
# serial number = HF309D7XGXE
/interface bridge
add admin-mac=78:9A:18:63:92:27 auto-mac=no comment=defconf name=bridgeLocal
add name=clients-br
add name=printers-br
/interface wireless
set [ find default-name=wlan1 ] band=2ghz-b/g/n disabled=no mode=ap-bridge \
    ssid=MikroTik
/caps-man datapath
add bridge=printers-br local-forwarding=yes name=printer-datapath
/caps-man security
add authentication-types=wpa2-psk encryption=aes-ccm name=printer-sec \
    passphrase=nnSFpRnt
add authentication-types=wpa2-psk encryption=aes-ccm name=printer-sec \
    passphrase=nnSFpRnt
/caps-man configuration
add name=printer-conf security=printer-sec ssid=Mikrotik
/interface list
add name=WAN
add name=LAN
/interface wireless security-profiles
set [ find default=yes ] authentication-types=wpa2-psk mode=dynamic-keys \
    supplicant-identity=MikroTik wpa-pre-shared-key=nnSFpRnt \
    wpa2-pre-shared-key=nnSFpRnt
/ip pool
add name=printers-pool ranges=192.168.0.101-192.168.0.254
add name=clients-pool ranges=172.16.0.10-172.16.0.250
/ip dhcp-server
add address-pool=printers-pool disabled=no interface=printers-br lease-time=\
    3d name=printers-dhcp
add address-pool=clients-pool disabled=no interface=clients-br lease-time=12h \
    name=clients-dhcp
/caps-man manager
set enabled=yes
/caps-man provisioning
add action=create-dynamic-enabled master-configuration=printer-conf
/interface bridge port
add bridge=printers-br comment=defconf interface=ether3
add bridge=clients-br hw=no interface=ether4
add bridge=printers-br interface=*F
add bridge=printers-br interface=ether2
add bridge=printers-br interface=wlan1
/interface bridge settings
set use-ip-firewall=yes
/interface list member
add interface=ether1 list=WAN
add interface=ether2 list=LAN
add interface=ether3 list=LAN
add interface=ether4 list=LAN
add interface=wlan1 list=LAN
/interface wireless cap
set bridge=bridgeLocal caps-man-addresses=127.0.0.1 discovery-interfaces=\
    bridgeLocal interfaces=wlan1
/interface wireless connect-list
add interface=wlan1
/ip address
add address=192.168.0.1/24 comment="Printers/Server GW" disabled=yes \
    interface=printers-br network=192.168.0.0
add address=172.16.0.1/24 comment="Clients GW" interface=clients-br network=\
    172.16.0.0
add address=192.168.0.1/24 interface=printers-br network=192.168.0.0
/ip arp
add address=192.168.0.100 interface=printers-br mac-address=D8:9E:F3:80:C4:0A
/ip dhcp-client
add disabled=no interface=ether1 use-peer-dns=no
/ip dhcp-server lease
add address=192.168.0.100 comment="SafePrint server" mac-address=\
    D8:9E:F3:80:C4:0A server=printers-dhcp
add address=192.168.0.101 client-id=1:f4:4e:b4:af:17:9d comment="Printer 1" \
    mac-address=F4:4E:B4:AF:17:9D server=printers-dhcp
add address=192.168.0.102 client-id=1:44:f7:9f:1a:6f:27 comment="Printer 2" \
    mac-address=44:F7:9F:1A:6F:27 server=printers-dhcp
add address=192.168.0.103 client-id=1:f4:4e:b4:75:ac:2a comment="Printer 3" \
    mac-address=F4:4E:B4:75:AC:2A server=printers-dhcp
add address=192.168.0.104 client-id=1:44:f7:9f:1a:71:f1 comment="Printer 4" \
    mac-address=44:F7:9F:1A:71:F1 server=printers-dhcp
add address=192.168.0.105 client-id=1:44:f7:9f:1a:75:67 comment="Printer 5" \
    mac-address=44:F7:9F:1A:75:67 server=printers-dhcp
/ip dhcp-server network
add address=172.16.0.0/24 dns-server=172.16.0.1 gateway=172.16.0.1
add address=192.168.0.0/24 dns-server=192.168.0.100 gateway=192.168.0.1
/ip dns
set allow-remote-requests=yes servers=192.168.0.100
/ip firewall filter
add action=passthrough chain=unused-hs-chain comment=\
    "place hotspot rules here" disabled=yes
add action=accept chain=forward comment="allow established/related" \
    connection-state=established,related
add action=accept chain=forward comment="printers <-> server local" \
    dst-address=192.168.0.0/24 src-address=192.168.0.0/24
add action=accept chain=forward comment="printers -> internet" out-interface=\
    ether1 src-address=192.168.0.0/24
add action=accept chain=forward comment="clients->pihole UDP" dst-address=\
    192.168.0.100 dst-port=53 protocol=udp src-address=172.16.0.0/24
add action=accept chain=forward comment=clients-internet out-interface=ether1 \
    src-address=172.16.0.0/24
add action=accept chain=forward comment="clients->SafePrint full" \
    dst-address=192.168.0.100 src-address=172.16.0.0/24
add action=drop chain=forward comment="block clients -> printers (all)" \
    dst-address=192.168.0.0/24 src-address=172.16.0.0/24
add action=drop chain=forward comment="block ping clients->printers" \
    dst-address=192.168.0.0/24 protocol=icmp src-address=172.16.0.0/24
add action=accept chain=forward comment=printers->internet out-interface=\
    ether1 src-address=192.168.0.0/24
add action=accept chain=forward comment="clients->pihole TCP" dst-address=\
    192.168.0.100 dst-port=53 protocol=tcp src-address=172.16.0.0/24
/ip firewall nat
add action=passthrough chain=unused-hs-chain comment=\
    "place hotspot rules here" disabled=yes
add action=masquerade chain=srcnat comment="masq printers->WAN" \
    out-interface=ether1 src-address=192.168.0.0/24
add action=masquerade chain=srcnat comment=masq-clients-WAN out-interface=\
    ether1 src-address=172.16.0.0/24
add action=masquerade chain=srcnat comment=clients-dns-to-pihole-udp \
    dst-address=192.168.0.100 dst-port=53 protocol=udp src-address=\
    172.16.0.0/24
add action=masquerade chain=srcnat comment=clients-dns-to-pihole-tcp \
    dst-address=192.168.0.100 dst-port=53 protocol=tcp src-address=\
    172.16.0.0/24
/ip hotspot user
add name=guest password=none
/ip service
set www disabled=yes
/system clock
set time-zone-name=Asia/Manila
