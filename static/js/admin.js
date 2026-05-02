// Mobile hamburger menu toggle
(function() {
    var toggle = document.querySelector('.mobile-menu-toggle');
    var navbar = document.querySelector('.vertical-navbar');
    var backdrop = document.querySelector('.mobile-nav-backdrop');
    if (toggle && navbar) {
        function openMenu() {
            toggle.classList.add('active');
            navbar.classList.add('open');
            if (backdrop) backdrop.classList.add('active');
        }
        function closeMenu() {
            toggle.classList.remove('active');
            navbar.classList.remove('open');
            if (backdrop) backdrop.classList.remove('active');
        }
        toggle.addEventListener('click', function() {
            navbar.classList.contains('open') ? closeMenu() : openMenu();
        });
        if (backdrop) backdrop.addEventListener('click', closeMenu);
        navbar.querySelectorAll('.navbar-item').forEach(function(link) {
            link.addEventListener('click', closeMenu);
        });
    }
})();

// Display Alert Messages
function createAlert(title, summary, details, severity, dismissible, autoDismiss, appendToId) {
    var iconMap = {
        info: "fa fa-info-circle",
        success: "fa fa-thumbs-up",
        warning: "fa fa-exclamation-triangle",
        danger: "fa fa-exclamation-circle"
    };

    var iconAdded = false;

    var alertClasses = ["alert", "animate__animated", "animate__flipInX"];
    alertClasses.push("alert-" + severity.toLowerCase());

    if (dismissible) {
        alertClasses.push("alert-dismissible");
    }

    var msgIcon = $("<i />", {
        "class": iconMap[severity]
    });

    var msg = $("<div />", {
        "class": alertClasses.join(" ")
    });

    if (title) {
        var msgTitle = $("<h4 />", {
            html: title
        }).appendTo(msg);

        if (!iconAdded) {
            msgTitle.prepend(msgIcon);
            iconAdded = true;
        }
    }

    if (summary) {
        var msgSummary = $("<strong />", {
            html: summary
        }).appendTo(msg);

        if (!iconAdded) {
            msgSummary.prepend(msgIcon);
            iconAdded = true;
        }
    }

    if (details) {
        var msgDetails = $("<p />", {
            html: details
        }).appendTo(msg);

        if (!iconAdded) {
            msgDetails.prepend(msgIcon);
            iconAdded = true;
        }
    }

    if (dismissible) {
        var msgClose = $("<span />", {
            "class": "close",
            "data-dismiss": "alert",
            html: "<i class='fa fa-times-circle'></i>"
        }).appendTo(msg);
    }

    $(document).on('click', '.alert .close', function () {
        $(this).closest('.alert').remove();
    });

    $('#' + appendToId).prepend(msg);

    if (autoDismiss) {
        setTimeout(function () {
            msg.removeClass("animate__flipInX").addClass("animate__flipOutX");
            setTimeout(function () {
                msg.remove();
            }, 1000);
        }, 5000);
    }
}

window.onload = function () {
    const alertData = sessionStorage.getItem('alert');
    if (alertData) {
        const { type, message } = JSON.parse(alertData);
        if (type === 'success') {
            createAlert('Success', 'Account Created', message, 'success', true, true, 'pageMessages');

        } else {
            createAlert('Error', 'Account Creation Failed', message, 'danger', true, true, 'pageMessages');
        }
        sessionStorage.removeItem('alert');
    }
};

let selectedIds = [];

// --- Reusable client-side pagination ---
function setupPagination(containerId, rowSelector, controlsId, perPage) {
    perPage = perPage || 10;
    var container = document.getElementById(containerId);
    if (!container) return null;
    var state = { page: 1, perPage: perPage, containerId: containerId, rowSelector: rowSelector, controlsId: controlsId };

    function getRows() {
        return Array.from(container.querySelectorAll(rowSelector)).filter(function(r) {
            return !r.classList.contains('empty-row') && r.style.display !== 'none-by-search';
        });
    }

    function render() {
        var rows = getRows();
        var total = rows.length;
        var totalPages = Math.max(1, Math.ceil(total / state.perPage));
        if (state.page > totalPages) state.page = totalPages;
        var start = (state.page - 1) * state.perPage;
        var end = start + state.perPage;
        rows.forEach(function(row, i) {
            row.style.display = (i >= start && i < end) ? '' : 'none';
        });
        var controls = document.getElementById(state.controlsId);
        if (!controls) return;
        if (total <= state.perPage) {
            controls.style.display = 'none';
            return;
        }
        controls.style.display = 'flex';
        var html = '<button class="pg-btn pg-prev" ' + (state.page <= 1 ? 'disabled' : '') + '>&laquo;</button>';
        for (var p = 1; p <= totalPages; p++) {
            html += '<button class="pg-btn' + (p === state.page ? ' pg-active' : '') + '" data-pg="' + p + '">' + p + '</button>';
        }
        html += '<button class="pg-btn pg-next" ' + (state.page >= totalPages ? 'disabled' : '') + '>&raquo;</button>';
        controls.innerHTML = html;
    }

    var controls = document.getElementById(state.controlsId);
    if (controls) {
        controls.addEventListener('click', function(e) {
            var btn = e.target.closest('.pg-btn');
            if (!btn || btn.disabled) return;
            if (btn.classList.contains('pg-prev')) state.page--;
            else if (btn.classList.contains('pg-next')) state.page++;
            else if (btn.dataset.pg) state.page = parseInt(btn.dataset.pg, 10);
            render();
        });
    }

    render();
    return { render: render, state: state };
}

document.addEventListener('DOMContentLoaded', () => {
    const ticketModal = document.getElementById('ticket-modal');
    const openTicketButtons = document.querySelectorAll('[data-open-ticket-modal]');
    const closeTicketTargets = document.querySelectorAll('[data-close-ticket-modal]');

    const openTicketModal = (button) => {
        if (!ticketModal) return;

        // Populate modal fields from data attributes on the clicked button
        if (button) {
            document.getElementById('modal-customer-id').textContent = button.getAttribute('data-customer-id') || '';
            document.getElementById('modal-doc-id').textContent = '#' + (button.getAttribute('data-doc-id') || '—');
            document.getElementById('modal-customer-name').textContent = button.getAttribute('data-customer-name') || '';
            document.getElementById('modal-doc-name').textContent = button.getAttribute('data-doc-name') || '';
            document.getElementById('modal-email').textContent = button.getAttribute('data-email') || '';
            document.getElementById('modal-phone').textContent = button.getAttribute('data-phone') || '—';
            document.getElementById('modal-issue').textContent = button.getAttribute('data-issue') || '';
            document.getElementById('modal-problem-type').textContent = button.getAttribute('data-problem-type') || '';
            document.getElementById('modal-reprinted').textContent = button.getAttribute('data-was-reprinted') === 'True' ? 'Yes' : 'No';
            document.getElementById('ticket-modal-title').textContent = button.getAttribute('data-ticket-number') || '';

            // GCash and payment amount
            var gcashEl = document.getElementById('modal-gcash');
            if (gcashEl) gcashEl.textContent = button.getAttribute('data-gcash-number') || '—';
            var payAmountEl = document.getElementById('modal-payment-amount');
            if (payAmountEl) {
                var amt = button.getAttribute('data-payment-amount');
                payAmountEl.textContent = amt ? '₱' + parseFloat(amt).toFixed(2) : '—';
            }

            // Refund section
            var refundSection = document.getElementById('modal-refund-section');
            var refundStatus = button.getAttribute('data-refund-status') || 'none';
            var ticketId = button.getAttribute('data-ticket-id') || '';
            if (refundSection) {
                if (refundStatus === 'pending') {
                    refundSection.style.display = 'block';
                    var refAmtEl = document.getElementById('modal-refund-amount');
                    var refGcashEl = document.getElementById('modal-refund-gcash');
                    if (refAmtEl) {
                        var refAmt = button.getAttribute('data-refund-amount');
                        refAmtEl.textContent = refAmt ? '₱' + parseFloat(refAmt).toFixed(2) : '—';
                    }
                    if (refGcashEl) refGcashEl.textContent = button.getAttribute('data-gcash-number') || '—';
                    var refInput = document.getElementById('modal-refund-ref');
                    if (refInput) refInput.value = '';
                    // Wire up complete refund button
                    var completeBtn = document.getElementById('modal-complete-refund-btn');
                    if (completeBtn) {
                        completeBtn.onclick = function() {
                            var ref = document.getElementById('modal-refund-ref').value.trim();
                            if (!ref) { alert('Please enter the GCash reference number.'); return; }
                            fetch('/portal/api/complete-refund/', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                                body: JSON.stringify({ ticket_id: ticketId, refund_reference: ref })
                            })
                            .then(function(r) { return r.json(); })
                            .then(function(data) {
                                if (data.success) {
                                    createAlert('Success', 'Refund Completed', 'Refund marked as completed. Ref: ' + ref, 'success', true, true, 'pageMessages');
                                    refundSection.style.display = 'none';
                                    if (typeof refreshTickets === 'function') refreshTickets();
                                    fetchAuditLog(ticketId);
                                } else {
                                    createAlert('Error', 'Complete Failed', data.error || 'Failed to complete refund.', 'danger', true, true, 'pageMessages');
                                }
                            });
                        };
                    }
                } else {
                    refundSection.style.display = 'none';
                }
            }

            // Store ticket ID for audit log button
            window._currentTicketId = ticketId;

            // Receipt proof section
            var receiptCodeEl = document.getElementById('modal-receipt-code');
            var receiptImgContainer = document.getElementById('modal-receipt-image-container');
            var receiptNone = document.getElementById('modal-receipt-none');
            var receiptImg = document.getElementById('modal-receipt-img');
            var receiptBtn = document.getElementById('modal-receipt-btn');
            var receiptCode = button.getAttribute('data-receipt-code') || '';
            var receiptUrl = button.getAttribute('data-receipt-screenshot-url') || '';
            if (receiptCodeEl) receiptCodeEl.textContent = receiptCode || '—';
            if (receiptUrl) {
                if (receiptImg) receiptImg.src = receiptUrl;
                if (receiptImgContainer) receiptImgContainer.style.display = 'block';
                if (receiptNone) receiptNone.style.display = 'none';
                if (receiptBtn) {
                    receiptBtn.onclick = function() {
                        var overlay = document.getElementById('receipt-image-overlay');
                        var overlayImg = document.getElementById('receipt-overlay-img');
                        if (overlay && overlayImg) {
                            overlayImg.src = receiptUrl;
                            overlay.style.display = 'flex';
                            overlay.setAttribute('aria-hidden', 'false');
                        }
                    };
                }
            } else {
                if (receiptImgContainer) receiptImgContainer.style.display = 'none';
                if (receiptNone) receiptNone.style.display = 'block';
            }

            // Proof Photos section
            var proofPhotosStr = button.getAttribute('data-proof-photos') || '';
            var proofContainer = document.getElementById('modal-proof-photos');
            var proofNone = document.getElementById('modal-proof-none');
            if (proofContainer) {
                proofContainer.innerHTML = '';
                if (proofPhotosStr) {
                    var proofUrls = proofPhotosStr.split(',').filter(function(u) { return u.trim(); });
                    if (proofUrls.length > 0) {
                        proofUrls.forEach(function(url) {
                            var btn = document.createElement('button');
                            btn.type = 'button';
                            btn.style.cssText = 'background:none; border:2px solid #ddd; border-radius:8px; padding:4px; cursor:pointer; transition:border-color 0.2s;';
                            btn.title = 'Click to view full image';
                            var img = document.createElement('img');
                            img.src = url.trim();
                            img.alt = 'Proof Photo';
                            img.style.cssText = 'max-width:120px; max-height:120px; border-radius:6px; display:block;';
                            btn.appendChild(img);
                            btn.onclick = function() {
                                var overlay = document.getElementById('receipt-image-overlay');
                                var overlayImg = document.getElementById('receipt-overlay-img');
                                if (overlay && overlayImg) {
                                    overlayImg.src = url.trim();
                                    overlay.style.display = 'flex';
                                    overlay.setAttribute('aria-hidden', 'false');
                                }
                            };
                            proofContainer.appendChild(btn);
                        });
                        if (proofNone) proofNone.style.display = 'none';
                    } else {
                        if (proofNone) proofNone.style.display = 'block';
                    }
                } else {
                    if (proofNone) proofNone.style.display = 'block';
                }
            }

            // Related Documents (batch ticket) section
            var relatedDocIds = button.getAttribute('data-related-doc-ids') || '';
            var relatedSection = document.getElementById('modal-related-docs-section');
            var relatedDocsEl = document.getElementById('modal-related-docs');
            if (relatedSection && relatedDocsEl) {
                if (relatedDocIds) {
                    try {
                        var docIds = JSON.parse(relatedDocIds);
                        if (Array.isArray(docIds) && docIds.length > 1) {
                            relatedDocsEl.textContent = docIds.join(', ');
                            relatedSection.style.display = 'block';
                        } else {
                            relatedSection.style.display = 'none';
                        }
                    } catch(e) {
                        relatedSection.style.display = 'none';
                    }
                } else {
                    relatedSection.style.display = 'none';
                }
            }
        }

        ticketModal.classList.add('is-open');
        ticketModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };

    function fetchAuditLog(ticketId) {
        var logTbody = document.getElementById('audit-log-tbody');
        if (!logTbody || !ticketId) return;
        logTbody.innerHTML = '<tr><td colspan="4" style="color:#999; padding:10px;">Loading...</td></tr>';
        fetch('/portal/api/ticket-audit-log/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
            body: JSON.stringify({ ticket_id: ticketId })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success && data.audit_logs && data.audit_logs.length > 0) {
                window._auditLogs = data.audit_logs;
                renderAuditTable(data.audit_logs, 'all');
            } else {
                logTbody.innerHTML = '<tr><td colspan="4" style="color:#999; padding:10px;">No activity log yet.</td></tr>';
                window._auditLogs = [];
            }
        })
        .catch(function() {
            logTbody.innerHTML = '<tr><td colspan="4" style="color:#d9534f; padding:10px;">Failed to load audit log.</td></tr>';
        });
    }

    function renderAuditTable(logs, filter) {
        var logTbody = document.getElementById('audit-log-tbody');
        if (!logTbody) return;

        var filtered = logs;
        if (filter === 'status') {
            filtered = logs.filter(function(l) {
                return ['Ticket Created', 'Status Changed', 'Ticket Voided', 'Ticket Verified'].indexOf(l.action) !== -1;
            });
        } else if (filter === 'refund') {
            filtered = logs.filter(function(l) {
                return ['Refund Approved', 'Refund Completed', 'Refund Rejected'].indexOf(l.action) !== -1;
            });
        } else if (filter === 'admin') {
            filtered = logs.filter(function(l) {
                return ['Note Added', 'Data Purged'].indexOf(l.action) !== -1 || l.performed_by;
            });
        }

        if (filtered.length === 0) {
            logTbody.innerHTML = '<tr><td colspan="4" style="color:#999; padding:10px;">No entries for this filter.</td></tr>';
            var pgDiv = document.getElementById('audit-log-pagination');
            if (pgDiv) pgDiv.innerHTML = '';
            return;
        }

        // Render all rows then paginate
        logTbody.innerHTML = filtered.map(function(log) {
            var escapedDetails = (log.details || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            var escapedBy = (log.performed_by || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            var escapedAction = (log.action || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return '<tr class="audit-log-row" style="border-bottom:1px solid #f0f0f0;">'
                + '<td style="padding:6px 8px; font-weight:600; white-space:nowrap;">' + escapedAction + '</td>'
                + '<td style="padding:6px 8px; color:#555;">' + escapedDetails + '</td>'
                + '<td style="padding:6px 8px; color:#888;">' + escapedBy + '</td>'
                + '<td style="padding:6px 8px; color:#888; white-space:nowrap; font-size:0.75rem;">' + log.timestamp + '</td>'
                + '</tr>';
        }).join('');

        // Setup pagination (10 per page)
        var rows = logTbody.querySelectorAll('.audit-log-row');
        var perPage = 10;
        var pgDiv = document.getElementById('audit-log-pagination');
        if (rows.length <= perPage) {
            if (pgDiv) pgDiv.innerHTML = '';
            return;
        }
        var totalPages = Math.ceil(rows.length / perPage);
        var currentPage = 1;

        function showPage(page) {
            currentPage = page;
            rows.forEach(function(row, i) {
                row.style.display = (i >= (page - 1) * perPage && i < page * perPage) ? '' : 'none';
            });
            renderPgBtns();
        }

        function renderPgBtns() {
            if (!pgDiv) return;
            var html = '';
            for (var p = 1; p <= totalPages; p++) {
                html += '<button class="pg-btn' + (p === currentPage ? ' pg-active' : '') + '" data-audit-pg="' + p + '">' + p + '</button>';
            }
            pgDiv.innerHTML = html;
        }

        if (pgDiv) {
            pgDiv.addEventListener('click', function(e) {
                var btn = e.target.closest('[data-audit-pg]');
                if (btn) showPage(parseInt(btn.dataset.auditPg, 10));
            });
        }

        showPage(1);
    }

    // Audit filter button clicks
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.audit-filter-btn');
        if (!btn) return;
        document.querySelectorAll('.audit-filter-btn').forEach(function(b) {
            b.classList.remove('active');
            b.style.background = '#fff';
            b.style.color = '#18191F';
        });
        btn.classList.add('active');
        btn.style.background = '#18191F';
        btn.style.color = '#fff';
        if (window._auditLogs) {
            renderAuditTable(window._auditLogs, btn.dataset.filter);
        }
    });

    window.fetchAuditLog = fetchAuditLog;

    // Activity Log modal
    var auditModal = document.getElementById('audit-log-modal');
    var openAuditBtn = document.getElementById('open-audit-log-btn');

    function openAuditLogModal() {
        if (!auditModal || !window._currentTicketId) return;
        // Reset to Ticket Log tab
        switchAuditMainTab('ticket');
        // Reset filters
        var auditFilterBtns = auditModal.querySelectorAll('.audit-filter-btn');
        auditFilterBtns.forEach(function(b) {
            b.classList.remove('active');
            b.style.background = '#fff';
            b.style.color = '#18191F';
        });
        var allBtn = auditModal.querySelector('.audit-filter-btn[data-filter="all"]');
        if (allBtn) {
            allBtn.classList.add('active');
            allBtn.style.background = '#18191F';
            allBtn.style.color = '#fff';
        }
        fetchAuditLog(window._currentTicketId);
        auditModal.classList.add('is-open');
        auditModal.setAttribute('aria-hidden', 'false');
    }

    function closeAuditLogModal() {
        if (!auditModal) return;
        auditModal.classList.remove('is-open');
        auditModal.setAttribute('aria-hidden', 'true');
    }

    // Main tab switching (Ticket Log | Printer Status | Document History)
    function switchAuditMainTab(tab) {
        document.querySelectorAll('.audit-main-tab').forEach(function(b) {
            b.classList.remove('active');
            b.style.background = '#f0f0f0';
            b.style.color = '#18191F';
        });
        var activeBtn = document.querySelector('.audit-main-tab[data-main-tab="' + tab + '"]');
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.style.background = '#18191F';
            activeBtn.style.color = '#fff';
        }
        document.querySelectorAll('.audit-tab-panel').forEach(function(p) { p.style.display = 'none'; });
        var panel = document.getElementById('audit-tab-' + tab);
        if (panel) panel.style.display = '';

        // Fetch verification data when switching to printer or document tabs
        if ((tab === 'printer' || tab === 'document') && window._currentTicketId) {
            fetchVerificationData();
        }
    }

    document.addEventListener('click', function(e) {
        var tab = e.target.closest('.audit-main-tab');
        if (tab && tab.dataset.mainTab) {
            switchAuditMainTab(tab.dataset.mainTab);
        }
    });

    function fetchVerificationData() {
        var printerTbody = document.getElementById('audit-printer-tbody');
        var docTbody = document.getElementById('audit-doc-tbody');
        var timeLabel = document.getElementById('audit-ticket-time');
        var windowSelect = document.getElementById('audit-time-window');
        var timeWindow = windowSelect ? parseInt(windowSelect.value, 10) : 10;

        if (printerTbody) printerTbody.innerHTML = '<tr><td colspan="5" style="color:#999; padding:10px;">Loading...</td></tr>';
        if (docTbody) docTbody.innerHTML = '<tr><td colspan="4" style="color:#999; padding:10px;">Loading...</td></tr>';

        fetch('/portal/api/ticket-verification-data/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
            body: JSON.stringify({ ticket_id: window._currentTicketId, time_window: timeWindow })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data.success) {
                if (printerTbody) printerTbody.innerHTML = '<tr><td colspan="5" style="color:#d9534f; padding:10px;">' + (data.error || 'Error') + '</td></tr>';
                return;
            }

            if (timeLabel) timeLabel.textContent = 'Ticket created: ' + data.ticket_created_at;

            // Render printer logs
            if (printerTbody) {
                if (data.printer_logs && data.printer_logs.length > 0) {
                    printerTbody.innerHTML = data.printer_logs.map(function(log) {
                        var statusStyle = '';
                        var s = (log.status || '').toLowerCase();
                        if (s.indexOf('jam') !== -1 || s.indexOf('error') !== -1) {
                            statusStyle = 'color:#d9534f; font-weight:700;';
                        } else if (s === 'offline') {
                            statusStyle = 'color:#f0ad4e; font-weight:600;';
                        } else if (s === 'ready' || s === 'printing') {
                            statusStyle = 'color:#5cb85c;';
                        }
                        return '<tr style="border-bottom:1px solid #f0f0f0;">'
                            + '<td style="padding:6px 8px; white-space:nowrap; font-size:0.75rem; color:#888;">' + log.timestamp + '</td>'
                            + '<td style="padding:6px 8px; font-weight:600;">' + (log.printer_name || '').replace(/</g, '&lt;') + '</td>'
                            + '<td style="padding:6px 8px; ' + statusStyle + '">' + (log.status || '').replace(/</g, '&lt;') + '</td>'
                            + '<td style="padding:6px 8px; color:#555;">' + (log.ink_status || '—').replace(/</g, '&lt;') + '</td>'
                            + '<td style="padding:6px 8px; color:#555;">' + (log.paper_level || '—').replace(/</g, '&lt;') + '</td>'
                            + '</tr>';
                    }).join('');
                } else {
                    printerTbody.innerHTML = '<tr><td colspan="5" style="color:#999; padding:10px;">No printer status changes in this time window.</td></tr>';
                }
            }

            // Render document lifecycle logs
            if (docTbody) {
                if (data.document_logs && data.document_logs.length > 0) {
                    docTbody.innerHTML = data.document_logs.map(function(log) {
                        var eventStyle = '';
                        var ev = (log.event || '').toLowerCase();
                        if (ev === 'cancelled' || ev === 'denied' || ev === 'deleted') {
                            eventStyle = 'color:#d9534f; font-weight:600;';
                        } else if (ev === 'finished' || ev === 'picked up') {
                            eventStyle = 'color:#5cb85c; font-weight:600;';
                        } else if (ev === 'printing' || ev === 'reprinted') {
                            eventStyle = 'color:#337ab7; font-weight:600;';
                        } else if (ev === 'rerouted') {
                            eventStyle = 'color:#f0ad4e; font-weight:600;';
                        }
                        return '<tr style="border-bottom:1px solid #f0f0f0;">'
                            + '<td style="padding:6px 8px; white-space:nowrap; font-size:0.75rem; color:#888;">' + log.timestamp + '</td>'
                            + '<td style="padding:6px 8px; ' + eventStyle + '">' + (log.event || '').replace(/</g, '&lt;') + '</td>'
                            + '<td style="padding:6px 8px; color:#555;">' + (log.details || '—').replace(/</g, '&lt;') + '</td>'
                            + '<td style="padding:6px 8px; color:#888;">' + (log.printer_name || '—').replace(/</g, '&lt;') + '</td>'
                            + '</tr>';
                    }).join('');
                } else {
                    docTbody.innerHTML = '<tr><td colspan="4" style="color:#999; padding:10px;">No document lifecycle records found.</td></tr>';
                }
            }
        })
        .catch(function() {
            if (printerTbody) printerTbody.innerHTML = '<tr><td colspan="5" style="color:#d9534f; padding:10px;">Failed to load data.</td></tr>';
            if (docTbody) docTbody.innerHTML = '<tr><td colspan="4" style="color:#d9534f; padding:10px;">Failed to load data.</td></tr>';
        });
    }

    // Refresh button for printer status tab
    var refreshPrinterBtn = document.getElementById('audit-refresh-printer');
    if (refreshPrinterBtn) {
        refreshPrinterBtn.addEventListener('click', fetchVerificationData);
    }

    if (openAuditBtn) {
        openAuditBtn.addEventListener('click', openAuditLogModal);
    }

    document.addEventListener('click', function(e) {
        if (e.target.closest('[data-close-audit-modal]')) {
            closeAuditLogModal();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && auditModal && auditModal.classList.contains('is-open')) {
            closeAuditLogModal();
        }
    });

    // ── Printer History Modal ───────────────────────────────────────
    var phModal = document.getElementById('printer-history-modal');
    var phPage = 1;

    window.openPrinterHistoryModal = function() {
        if (!phModal) return;
        phPage = 1;
        // Populate printer dropdown from status page printers (fetch from API)
        fetchPrinterHistory();
        phModal.classList.add('is-open');
        phModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };

    function closePrinterHistoryModal() {
        if (!phModal) return;
        phModal.classList.remove('is-open');
        phModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    document.addEventListener('click', function(e) {
        if (e.target.closest('[data-close-printer-history]')) {
            closePrinterHistoryModal();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && phModal && phModal.classList.contains('is-open')) {
            closePrinterHistoryModal();
        }
    });

    function fetchPrinterHistory() {
        var tbody = document.getElementById('ph-tbody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" style="color:#999; padding:10px;">Loading...</td></tr>';

        var printerId = document.getElementById('ph-printer-filter') ? document.getElementById('ph-printer-filter').value : '';
        var statusFilter = document.getElementById('ph-status-filter') ? document.getElementById('ph-status-filter').value : '';
        var dateFrom = document.getElementById('ph-date-from') ? document.getElementById('ph-date-from').value : '';
        var dateTo = document.getElementById('ph-date-to') ? document.getElementById('ph-date-to').value : '';

        var payload = { page: phPage, page_size: 15 };
        if (printerId) payload.printer_id = parseInt(printerId, 10);
        if (statusFilter) payload.status_filter = statusFilter;
        if (dateFrom) payload.date_from = dateFrom + 'T00:00:00';
        if (dateTo) payload.date_to = dateTo + 'T23:59:59';

        fetch('/portal/api/printer-status-history/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
            body: JSON.stringify(payload)
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success && data.logs && data.logs.length > 0) {
                renderPrinterHistory(data.logs);
                renderPhPagination(data.page, data.total_pages);
                if (data.printers) populatePrinterDropdown(data.printers);
            } else if (data.success) {
                tbody.innerHTML = '<tr><td colspan="5" style="color:#999; padding:10px;">No printer status history found.</td></tr>';
                var pgDiv = document.getElementById('ph-pagination');
                if (pgDiv) pgDiv.innerHTML = '';
                if (data.printers) populatePrinterDropdown(data.printers);
            } else {
                tbody.innerHTML = '<tr><td colspan="5" style="color:#999; padding:10px;">No printer status history found.</td></tr>';
                var pgDiv = document.getElementById('ph-pagination');
                if (pgDiv) pgDiv.innerHTML = '';
            }
        })
        .catch(function() {
            tbody.innerHTML = '<tr><td colspan="5" style="color:#d9534f; padding:10px;">Failed to load printer history.</td></tr>';
        });
    }

    function renderPrinterHistory(logs) {
        var tbody = document.getElementById('ph-tbody');
        if (!tbody) return;
        tbody.innerHTML = logs.map(function(log) {
            var statusClass = '';
            var statusLower = (log.status || '').toLowerCase();
            if (statusLower.indexOf('jam') !== -1 || statusLower.indexOf('error') !== -1) {
                statusClass = 'color:#d9534f; font-weight:700;';
            } else if (statusLower === 'offline') {
                statusClass = 'color:#f0ad4e; font-weight:600;';
            } else if (statusLower === 'ready' || statusLower === 'printing') {
                statusClass = 'color:#5cb85c;';
            }
            var escapedPrinter = (log.printer_name || '').replace(/</g, '&lt;');
            var escapedStatus = (log.status || '').replace(/</g, '&lt;');
            var escapedInk = (log.ink_status || '—').replace(/</g, '&lt;');
            var escapedPaper = (log.paper_level || '—').replace(/</g, '&lt;');
            return '<tr style="border-bottom:1px solid #f0f0f0;">'
                + '<td style="padding:6px 8px; white-space:nowrap; font-size:0.75rem; color:#888;">' + log.timestamp + '</td>'
                + '<td style="padding:6px 8px; font-weight:600;">' + escapedPrinter + '</td>'
                + '<td style="padding:6px 8px; ' + statusClass + '">' + escapedStatus + '</td>'
                + '<td style="padding:6px 8px; color:#555;">' + escapedInk + '</td>'
                + '<td style="padding:6px 8px; color:#555;">' + escapedPaper + '</td>'
                + '</tr>';
        }).join('');
    }

    function renderPhPagination(currentPage, totalPages) {
        var pgDiv = document.getElementById('ph-pagination');
        if (!pgDiv || totalPages <= 1) {
            if (pgDiv) pgDiv.innerHTML = '';
            return;
        }
        var html = '';
        for (var p = 1; p <= totalPages; p++) {
            html += '<button class="pg-btn' + (p === currentPage ? ' pg-active' : '') + '" data-ph-pg="' + p + '">' + p + '</button>';
        }
        pgDiv.innerHTML = html;
    }

    var phPgDiv = document.getElementById('ph-pagination');
    if (phPgDiv) {
        phPgDiv.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-ph-pg]');
            if (btn) {
                phPage = parseInt(btn.dataset.phPg, 10);
                fetchPrinterHistory();
            }
        });
    }

    var phApplyBtn = document.getElementById('ph-apply-filter');
    if (phApplyBtn) {
        phApplyBtn.addEventListener('click', function() {
            phPage = 1;
            fetchPrinterHistory();
        });
    }

    var _phPrintersPopulated = false;
    function populatePrinterDropdown(printers) {
        if (_phPrintersPopulated) return;
        var select = document.getElementById('ph-printer-filter');
        if (!select) return;
        printers.forEach(function(p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            select.appendChild(opt);
        });
        _phPrintersPopulated = true;
    }

    // ── End Printer History Modal ───────────────────────────────────

    const closeTicketModal = () => {
        if (!ticketModal) return;
        ticketModal.classList.remove('is-open');
        ticketModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    if (ticketModal) {
        // Use event delegation so dynamically added buttons also work
        document.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-open-ticket-modal]');
            if (btn) openTicketModal(btn);
        });

        closeTicketTargets.forEach((target) => {
            target.addEventListener('click', closeTicketModal);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && ticketModal.classList.contains('is-open')) {
                closeTicketModal();
            }
        });
    }

    // Receipt image overlay close handlers
    (function() {
        var overlay = document.getElementById('receipt-image-overlay');
        if (!overlay) return;
        var closeBtn = document.getElementById('receipt-overlay-close');
        function closeOverlay() {
            overlay.style.display = 'none';
            overlay.setAttribute('aria-hidden', 'true');
        }
        if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeOverlay();
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && overlay.style.display === 'flex') {
                e.stopImmediatePropagation();
                e.preventDefault();
                closeOverlay();
            }
        }, true);
    })();

    const activeResults = document.getElementById('document-results');
    const resolvedResults = document.querySelector('.resolved-list-container .document-results');

    const buildResolvedRow = (data) => {
        const row = document.createElement('div');
        row.className = 'document-item resolved-row';
        const priceText = data.payment_amount ? '₱' + Number(data.payment_amount).toFixed(2) : (data.price || '—');
        const ticketNumber = data.ticket_number || data.ticketNumber || '';
        const customerName = data.customer_name || data.customerName || '';
        const email = data.email || '';
        const verifiedBy = data.resolved_by || data.verifiedBy || '—';
        const status = data.status || '';
        const ticketId = data.ticket_id || '';
        const customerId = data.customer_id || '';
        const phone = data.phone || '';
        const docId = data.doc_id || '';
        const docName = data.doc_name || '';
        const issue = data.description || '';
        const gcashNumber = data.gcash_number || '';
        const paymentAmount = data.payment_amount || '';
        const refundStatus = data.refund_status || 'none';
        const refundAmount = data.refund_amount || '';
        const problemType = data.problem_type || '';
        const wasReprinted = data.was_reprinted ? 'True' : 'False';

        row.innerHTML = `
            <div class="ticket-cell">
                <img src="/static/assets/ticket-icon.png" alt="Ticket" class="ticket-icon">
                <div class="ticket-meta">
                    <h6>${ticketNumber}</h6>
                    <span>${priceText}</span>
                </div>
            </div>
            <div class="resolved-customer">${customerName}</div>
            <div class="resolved-email">${email}</div>
            <div class="resolved-verifier">${verifiedBy}</div>
            <div class="resolved-status">${status}</div>
            <div class="resolved-details">
                <button class="approve-btn view-details-btn" type="button" data-open-ticket-modal
                    data-ticket-id="${ticketId}"
                    data-ticket-number="${ticketNumber}"
                    data-customer-id="${customerId}"
                    data-customer-name="${customerName}"
                    data-email="${email}"
                    data-phone="${phone}"
                    data-doc-id="${docId}"
                    data-doc-name="${docName}"
                    data-issue="${issue}"
                    data-problem-type="${problemType}"
                    data-was-reprinted="${wasReprinted}"
                    data-gcash-number="${gcashNumber}"
                    data-payment-amount="${paymentAmount}"
                    data-refund-status="${refundStatus}"
                    data-refund-amount="${refundAmount}"
                    data-receipt-code="${data.receipt_code || ''}"
                    data-receipt-screenshot-url="${data.receipt_screenshot_url || ''}"
                >View Details</button>
            </div>
        `;
        return row;
    };

    const updateTicketCounts = () => {
        const activeCountEl = document.getElementById('active-tickets-count');

        if (activeResults && activeCountEl) {
            const activeRows = Array.from(activeResults.querySelectorAll('.document-item'))
                .filter((row) => !row.classList.contains('empty-row'));
            activeCountEl.textContent = activeRows.length.toString();
        }
    };

    const updateResolvedEmptyState = () => {
        if (!resolvedResults) return;
        const existingEmptyRow = resolvedResults.querySelector('.document-item.empty-row');
        const rows = Array.from(resolvedResults.querySelectorAll('.document-item.resolved-row'));

        if (rows.length === 0) {
            if (!existingEmptyRow) {
                const emptyRow = document.createElement('div');
                emptyRow.className = 'document-item resolved-row empty-row';
                emptyRow.innerHTML = `
                    <div class="ticket-cell">
                        <div class="ticket-meta">
                            <p style="font-family: 'Montserrat', sans-serif;">No resolved tickets.</p>
                        </div>
                    </div>
                    <div class="resolved-customer"></div>
                    <div class="resolved-email"></div>
                    <div class="resolved-verifier"></div>
                    <div class="resolved-status"></div>
                `;
                resolvedResults.appendChild(emptyRow);
            }
        } else if (existingEmptyRow) {
            existingEmptyRow.remove();
        }
    };

    const updateActiveEmptyState = () => {
        if (!activeResults) return;
        const existingEmpty = activeResults.querySelector('.no-documents');
        const existingEmptyRow = activeResults.querySelector('.document-item.empty-row');
        const rows = Array.from(activeResults.querySelectorAll('.document-item'));

        if (rows.length === 0) {
            if (!existingEmptyRow) {
                if (existingEmpty) existingEmpty.remove();
                const emptyRow = document.createElement('div');
                emptyRow.className = 'document-item empty-row';
                emptyRow.innerHTML = `
                    <div class="ticket-cell">
                        <div class="ticket-meta">
                            <p style="font-family: 'Montserrat', sans-serif;">No active tickets.</p>
                        </div>
                    </div>
                    <div class="ticket-customer"></div>
                    <div class="ticket-date"></div>
                    <div class="ticket-doc"></div>
                    <div class="actions"></div>
                `;
                activeResults.appendChild(emptyRow);
            }
        } else {
            if (existingEmpty) existingEmpty.remove();
            if (existingEmptyRow) existingEmptyRow.remove();
        }
    };

    const moveToResolved = (row, status) => {
        if (!resolvedResults || !row) return;

        const ticketNumber = row.querySelector('.ticket-meta h6')?.textContent?.trim() || '-';
        const price = row.querySelector('.ticket-meta span')?.textContent?.trim() || '-';
        const customerId = row.querySelector('.ticket-customer')?.textContent?.trim() || 'Customer';

        const data = {
            ticketNumber,
            price,
            customerName: row.dataset.customerName || customerId,
            email: row.dataset.customerEmail || 'example@email.com',
            verifiedBy: row.dataset.verifiedBy || 'Admin',
            status
        };

        const newRow = buildResolvedRow(data);
        const header = resolvedResults.querySelector('.list-header');
        if (header && header.nextSibling) {
            resolvedResults.insertBefore(newRow, null);
        } else {
            resolvedResults.appendChild(newRow);
        }

        row.remove();
        updateActiveEmptyState();
        updateResolvedEmptyState();
        updateTicketCounts();
    };

    // Attach event listeners to any existing dynamic elements (if on dashboard page)
    if (typeof attachTicketEventListeners === 'function') {
        attachTicketEventListeners();
    }

    updateResolvedEmptyState();

    //Customer ID Enter key Functionality
    const customerIdInput = document.getElementById('customer-id-input');
    const searchBtn = document.getElementById('search-btn');
    if (customerIdInput && searchBtn) {
        customerIdInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchBtn.click();
            }
        });
    }

    // CID Post to Backend
    if (searchBtn) {
        searchBtn.addEventListener('click', function () {
            const customerId = document.getElementById('customer-id-input').value.trim();
            if (!customerId) {
                createAlert('Error', 'Customer ID Required', 'Please enter a Customer ID to search for documents.', 'danger', true, true, 'pageMessages');
                return;
            }
            fetch('/api/search_customer/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                },
                body: JSON.stringify({ customer_id: customerId })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        displayDocuments(data.documents, data.total_price);
                        document.getElementById('customer-id-input').value = data.customer_id;
                        toggleActionButtons(true);
                    } else {
                        createAlert('Error', 'Search Failed', data.error || 'No documents found for the provided Customer ID.', 'danger', true, true, 'pageMessages');
                        toggleActionButtons(false);
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    createAlert('Error', 'Search Failed', 'An error occurred while searching for documents. Please try again later.', 'danger', true, true, 'pageMessages');
                });
        });
    }

    // Clear Button Functionality in Dashboard to clear price and CID
    const clearBtn = document.getElementById('clear-btn');
    const priceToPay = document.getElementById('price-to-pay');
    if (clearBtn && customerIdInput && priceToPay) {
        clearBtn.onclick = function () {
            customerIdInput.value = '';
            priceToPay.textContent = '₱0.00';
            toggleActionButtons(false);

            const resultsDiv = document.getElementById('document-results');
            if (resultsDiv) {
                const searchBar = resultsDiv.querySelector('.search-bar');
                const docTitle = resultsDiv.querySelector('.document-item-title');
                if (searchBar) searchBar.style.display = 'none';
                if (docTitle) docTitle.style.display = 'none';
                Array.from(resultsDiv.querySelectorAll('.document-item, .no-documents')).forEach(el => el.remove());
                resultsDiv.innerHTML += `
                    <div class="no-documents">
                        <img src="/static/assets/no-documents.png" alt="No Documents">
                        <p>No documents found, Please enter a Customer ID</p>
                    </div>
                `;
            }
        };
    }

    // Deny All Documents
    const denyAllBtn = document.getElementById('deny-all-btn');
    if (denyAllBtn) {
        denyAllBtn.addEventListener('click', function () {
            const customerId = document.getElementById('customer-id-input').value.trim();
            if (!customerId) {
                createAlert('Error', 'Customer ID Required', 'Please enter a Customer ID to deny all documents.', 'danger', true, true, 'pageMessages');
                return;
            }

            fetch('/api/deny-all-documents/', {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ customer_id: customerId })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        createAlert('Success', 'Denied', `All documents denied.`, 'success', true, true, 'pageMessages');
                        customerIdInput.value = '';
                        priceToPay.textContent = '₱0.00';
                        toggleActionButtons(false);

                        const resultsDiv = document.getElementById('document-results');
                        if (resultsDiv) {
                            const searchBar = resultsDiv.querySelector('.search-bar');
                            const docTitle = resultsDiv.querySelector('.document-item-title');
                            if (searchBar) searchBar.style.display = 'none';
                            if (docTitle) docTitle.style.display = 'none';
                            Array.from(resultsDiv.querySelectorAll('.document-item, .no-documents')).forEach(el => el.remove());
                            resultsDiv.innerHTML += `
                            <div class="no-documents">
                                <img src="/static/assets/no-documents.png" alt="No Documents">
                                <p>No documents found, Please enter a Customer ID</p>
                            </div>
                        `;
                        }
                    } else {
                        createAlert('Error', 'Deny Failed', data.error || 'Unknown error.', 'danger', true, true, 'pageMessages');
                    }
                })
                .catch(error => {
                    createAlert('Error', 'Deny Failed', 'An error occurred while denying documents.', 'danger', true, true, 'pageMessages');
                });
        });
    }

    // Approve All Documents
    const approveAllBtn = document.querySelector('.approve-btn#approve-all-btn') || document.getElementById('approve-all-btn');
    if (approveAllBtn) {
        approveAllBtn.addEventListener('click', function () {
            const customerId = document.getElementById('customer-id-input').value.trim();
            if (!customerId) {
                createAlert('Error', 'Customer ID Required', 'Please enter a Customer ID to approve all documents.', 'danger', true, true, 'pageMessages');
                return;
            }

            fetch('/api/approve-all-documents/', {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ customer_id: customerId })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        createAlert('Success', 'Approved', `All documents approved.`, 'success', true, true, 'pageMessages');
                        clearCustomerIdAndPrice();
                        // Update "Approved by" only for affected documents
                        if (data.approved_doc_ids) {
                            data.approved_doc_ids.forEach(docId => {
                                // Place this line here:
                                const approvedCol = document.querySelector(`#onqueue-doc-${docId.toString()} .doc-approved`);
                                if (approvedCol) {
                                    approvedCol.textContent = data.admin_name ? data.admin_name : '-';
                                }
                            });
                        }

                        const resultsDiv = document.getElementById('document-results');
                        if (resultsDiv) {
                            const searchBar = resultsDiv.querySelector('.search-bar');
                            const docTitle = resultsDiv.querySelector('.document-item-title');
                            if (searchBar) searchBar.style.display = 'none';
                            if (docTitle) docTitle.style.display = 'none';
                            Array.from(resultsDiv.querySelectorAll('.document-item, .no-documents')).forEach(el => el.remove());
                            resultsDiv.innerHTML += `
                            <div class="no-documents">
                                <img src="/static/assets/no-documents.png" alt="No Documents">
                                <p>No documents found, Please enter a Customer ID</p>
                            </div>
                        `;
                        }
                    } else {
                        createAlert('Error', 'Approve Failed', data.error || 'Unknown error.', 'danger', true, true, 'pageMessages');
                    }
                })
                .catch(error => {
                    createAlert('Error', 'Approve Failed', 'An error occurred while approving documents.', 'danger', true, true, 'pageMessages');
                });
        });
    }

    // Change Profile Image
    const imageUpload = document.getElementById('image-upload');
    if (imageUpload) {
        imageUpload.addEventListener('change', function () {
            var fileInput = this;
            if (fileInput.files.length > 0) {
                var formData = new FormData();
                formData.append('profile_image', fileInput.files[0]);
                fetch('/api/change-image-ajax/', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': csrfToken
                    },
                    body: formData
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            var img = document.getElementById('profile-img');
                            if (img) {
                                img.src = data.image_url + '?t=' + new Date().getTime();
                            };
                            createAlert('Success', 'Image Updated', 'Your profile image has been successfully updated.', 'success', true, true, 'pageMessages');
                            location.reload();
                        } else {
                            createAlert('Error', 'Image Upload Failed', data.error || 'An error occurred while uploading the image.', 'danger', true, true, 'pageMessages');
                        }
                    });
            }
        });
    }

    // Edit Name
    const editNameForm = document.getElementById('edit-name-form');
    if (editNameForm) {
        editNameForm.onsubmit = function (e) {
            e.preventDefault();
            var formData = new FormData(this);
            fetch('/api/update-name/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken
                },
                body: formData
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        createAlert('Success', 'Name Updated', 'Your name has been successfully updated.', 'success', true, true, 'pageMessages');
                        document.getElementById('Name').value = data.new_name;
                        hidePopupOverlay('editNameOverlay');
                        document.getElementById('edit-name-form').reset();
                    } else {
                        createAlert('Error', 'Update Failed', data.error || 'An error occurred while updating your name.', 'danger', true, true, 'pageMessages');
                    }
                });
        };
    }

    // Edit Username
    const editUsernameForm = document.getElementById('edit-username-form');
    if (editUsernameForm) {
        editUsernameForm.onsubmit = function (e) {
            e.preventDefault();
            var formData = new FormData(this);
            fetch('/api/update-username/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken
                },
                body: formData
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        createAlert('Success', 'Username Updated', 'Your username has been successfully updated.', 'success', true, true, 'pageMessages');
                        document.getElementById('Username').value = data.new_username;
                        hidePopupOverlay('editUsernameOverlay');
                        document.getElementById('edit-username-form').reset();
                    } else {
                        createAlert('Error', 'Update Failed', data.error || 'An error occurred while updating your username.', 'danger', true, false, 'pageMessages');
                    }
                });
        };
    }

    // Edit Password
    const editPasswordForm = document.getElementById('edit-password-form');
    if (editPasswordForm) {
        editPasswordForm.onsubmit = function (e) {
            e.preventDefault();
            var formData = new FormData(this);
            fetch('/api/update-password/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken
                },
                body: formData
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        createAlert('Success', 'Password Updated', 'Your password has been successfully updated.', 'success', true, true, 'pageMessages');
                        hidePopupOverlay('editPasswordOverlay');
                        document.getElementById('edit-password-form').reset();
                    } else {
                        createAlert('Error', 'Update Failed', data.error || 'An error occurred while updating your password.', 'danger', true, true, 'pageMessages');
                    }
                });
        };
    }

    // Edit Email
    const editEmailForm = document.getElementById('edit-email-form');
    if (editEmailForm) {
        editEmailForm.onsubmit = function (e) {
            e.preventDefault();
            var formData = new FormData(this);
            fetch('/api/update-email/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken
                },
                body: formData
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        createAlert('Success', 'Email Updated', 'Your notification email has been updated.', 'success', true, true, 'pageMessages');
                        document.getElementById('Email').value = data.new_email || '';
                        hidePopupOverlay('editEmailOverlay');
                        document.getElementById('edit-email-form').reset();
                    } else {
                        createAlert('Error', 'Update Failed', data.error || 'An error occurred while updating your email.', 'danger', true, true, 'pageMessages');
                    }
                });
        };
    }

    // Search User Accounts
    const searchUserInput = document.getElementById('searchUserInput');
    if (searchUserInput) {
        searchUserInput.addEventListener('input', function () {
            const filter = this.value.toLowerCase();
            const rows = document.querySelectorAll('.user-account-row');
            let visibleCount = 0;
            rows.forEach(row => {
                const usernameDiv = row.querySelector('.user-username');
                const nameDiv = row.querySelector('.user-name');
                if (usernameDiv && nameDiv) {
                    const username = usernameDiv.textContent.toLowerCase();
                    const name = nameDiv.textContent.toLowerCase();
                    const match = username.includes(filter) || name.includes(filter);
                    row.style.display = match ? '' : 'none';
                    if (match) visibleCount++;
                }
            });
            // Show "No match found" only if there are no visible user rows
            document.getElementById('no-match-row').style.display = visibleCount === 0 ? 'flex' : 'none';
        });
    }

    // Edit User Password
    const editUserPasswordForm = document.getElementById('edit-user-password-form');
    if (editUserPasswordForm) {
        editUserPasswordForm.onsubmit = function (e) {
            e.preventDefault();
            var formData = new FormData(this);
            fetch('/api/update-user-password/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken
                },
                body: formData
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        createAlert('Success', 'Password Updated', 'The user password has been successfully updated.', 'success', true, true, 'pageMessages');
                        hidePopupOverlay('editUserPasswordOverlay');
                        document.getElementById('edit-user-password-form').reset();
                    } else {
                        createAlert('Error', 'Update Failed', data.error || 'An error occurred while updating the user password.', 'danger', true, true, 'pageMessages');
                    }
                });
        };
    }

    // Delete User
    var deleteBtn = document.getElementById('deleteConfirmBtn');
    if (deleteBtn) {
        deleteBtn.onclick = function () {
            var userId = document.getElementById('delete-user-id').value;
            fetch('/api/delete_user_ajax/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                },
                credentials: 'same-origin',
                body: JSON.stringify({ user_ids: selectedIds })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        selectedIds.forEach(id => {
                            const row = document.getElementById('user-account-row-' + id);
                            if (row) row.remove();
                        });
                        hidePopupOverlay('deleteUserOverlay');
                        createAlert('Success', 'User Deleted', 'The user has been successfully deleted.', 'success', true, true, 'pageMessages');
                    } else {
                        createAlert('Error', 'Delete Failed', data.error || 'An error occurred while deleting the user.', 'danger', true, true, 'pageMessages');
                    }
                })
                .catch(error => {
                    console.error('Error deleting user:', error);
                    createAlert('Error', 'Delete Failed', 'An error occurred while deleting the user.', 'danger', true, true, 'pageMessages');
                });
        };
    }

    // Get all checkboxes and the delete button
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const userAccountsTable = document.querySelector('.user-accounts-table');
    if (deleteSelectedBtn && userAccountsTable) {
        // Delegate event to the container for dynamic rows
        userAccountsTable.addEventListener('change', function (e) {
            if (e.target.type === 'checkbox') {
                updateDeleteButton();
            }
        });

        // Define updateDeleteButton function within the scope
        function updateDeleteButton() {
            const checkedBoxes = document.querySelectorAll('.user-account-row input[type="checkbox"]:checked');
            deleteSelectedBtn.style.display = checkedBoxes.length > 0 ? 'inline-block' : 'none';
        }

        deleteSelectedBtn.addEventListener('click', function () {
            const checkedBoxes = document.querySelectorAll('.user-account-row input[type="checkbox"]:checked');
            const selectedIds = Array.from(checkedBoxes).map(cb => {
                const row = cb.closest('.user-account-row');
                return parseInt(row.id.replace('user-account-row-', ''), 10);
            });
            const label = selectedIds.length > 1 ? `${selectedIds.length} users` : `${selectedIds.length} user`;
            showDeleteUserOverlay(selectedIds, label);
        });
    }

    // Create Admin User Account
    const createAccountForm = document.getElementById('create-account-form');
    if (createAccountForm) {
        createAccountForm.onsubmit = function (e) {
            e.preventDefault();
            var form = this;
            var formData = new FormData(form);

            var name = formData.get('name');
            var email = formData.get('email');
            var username = formData.get('username');
            var password = formData.get('password');
            var confirmPassword = formData.get('confirm_password');

            fetch('/api/add_user_ajax/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({
                    name: name,
                    email: email,
                    username: username,
                    password: password,
                    confirm_password: confirmPassword
                })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        sessionStorage.setItem('alert', JSON.stringify({
                            type: 'success',
                            message: 'Account created successfully'
                        }));
                        location.reload();
                    } else {
                        sessionStorage.setItem('alert', JSON.stringify({
                            type: 'error',
                            message: data.error || 'An error occurred while creating the user account.'
                        }));
                        location.reload();
                    }
                });
        };
    }

    // Feedback Modals Post to Backend
    const feedbackBtn = document.querySelector('.settings-feedback-btn');
    if (feedbackBtn) {
        feedbackBtn.addEventListener('click', function (e) {
            e.preventDefault();
            document.getElementById('feedbackModal').style.display = 'block';
            fetch('/api/feedback-comments/')
                .then(response => response.json())
                .then(data => {
                    const list = document.querySelector("#feedbackModal .feedback-list");
                    list.innerHTML = "";
                    if (data.feedback_comments.length === 0) {
                        list.innerHTML = `<div class="feedback-card"><b>No feedback comments found.</b></div>`;
                    } else {
                        data.feedback_comments.forEach(fb => {
                            list.innerHTML += `
                            <div class="feedback-card">
                                <b>Name</b><br>
                                ${fb.name}
                                <div class="feedback-spacer"></div>
                                <b>Message</b><br>
                                ${fb.message}
                                <div class="feedback-spacer"></div>
                                <b>Submitted at:</b><br>
                                ${fb.submitted_at}
                            </div>
                        `;
                        });
                    }
                });
        });
    }

    // Problem Reports Modal Post to Backend
    const problemBtn = document.querySelector('.settings-problem-btn');
    if (problemBtn) {
        problemBtn.addEventListener('click', function (e) {
            e.preventDefault();
            document.getElementById('problemModal').style.display = 'block';
            fetch('/api/problem-reports/')
                .then(response => response.json())
                .then(data => {
                    const list = document.querySelector("#problemModal .feedback-list");
                    list.innerHTML = "";
                    if (data.problem_reports.length === 0) {
                        list.innerHTML = `<div class="feedback-card"><b>No problem reports found.</b></div>`;
                    } else {
                        data.problem_reports.forEach(fb => {
                            list.innerHTML += `
                            <div class="feedback-card">
                                <b>Name</b><br>
                                ${fb.name}
                                <div class="feedback-spacer"></div>
                                <b>Message</b><br>
                                ${fb.message}
                                <div class="feedback-spacer"></div>
                                <b>Submitted at:</b><br>
                                ${fb.submitted_at}
                            </div>
                        `;
                        });
                    }
                });
        });
    }

    // Close Feedback Modal
    var closeFeedbackBtn = document.getElementById('closeFeedbackModal');
    if (closeFeedbackBtn) {
        closeFeedbackBtn.onclick = function () {
            document.getElementById('feedbackModal').style.display = 'none';
        };
    }

    // Close Problem Reports Modal
    var closeProblemBtn = document.getElementById('closeProblemModal');
    if (closeProblemBtn) {
        closeProblemBtn.onclick = function () {
            document.getElementById('problemModal').style.display = 'none';
        };
    }

    // Close modals when clicking outside modal content
    window.addEventListener('click', function (event) {
        var feedbackModal = document.getElementById('feedbackModal');
        var problemModal = document.getElementById('problemModal');
        if (feedbackModal && event.target == feedbackModal) {
            feedbackModal.style.display = 'none';
        }
        if (problemModal && event.target == problemModal) {
            problemModal.style.display = 'none';
        }
    })

    // Printer Status Dropdowns Update Database
    const dropdownSelects = document.querySelectorAll('.dropdown-select');
    if (dropdownSelects.length > 0) {
        dropdownSelects.forEach(function (select) {
            select.addEventListener('change', function () {
                const printerId = this.dataset.printerId;
                const field = this.dataset.field;
                const value = this.value;
                // Only handle printer status dropdowns that declare both data attributes
                if (!printerId || !field) {
                    return;
                }

                // Form data for the request
                const formData = new FormData();
                formData.append('printer_id', printerId);
                formData.append('field', field);
                formData.append('value', value);
                
                fetch('/portal/api/update_printer_field/', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': csrfToken
                    },
                    body: formData
                })
                    .then(response => {
                        if (!response.ok) {
                            return response.text().then(text => {
                                console.error('Server response:', text);
                                throw new Error(`Server error: ${response.status}`);
                            });
                        }
                        return response.json();
                    })
                    .then(data => {
                        // Show appropriate success message based on field
                        let fieldLabel = field === 'paper_assigned' ? 'Paper Assigned' : 
                                         field === 'paper_quality' ? 'GSM' : 'Printer setting';
                        createAlert('Success', 'Printer Updated', `${fieldLabel} has been updated successfully.`, 'success', true, true, 'pageMessages');
                        // Reload page after short delay to reflect changes in Paper Refill section
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    })
                    .catch(error => {
                        console.error('Error updating printer setting:', error);
                        createAlert('Error', 'Update Failed', 'Failed to update printer setting. Please try again or contact support.', 'danger', true, true, 'pageMessages');
                    });
            });
        });
    }

    // Search Functionality of Pending-Document-List
    const searchInput = document.getElementById('pending-search');
    const noDocsRow = document.getElementById('no-pending-documents-row');
    let noMatchRow = document.getElementById('no-match-row');
    if (!noMatchRow && document.getElementById('pending-list')) {
        noMatchRow = document.createElement('div');
        noMatchRow.className = 'queue-row';
        noMatchRow.id = 'no-match-row';
        noMatchRow.style.display = 'none';
        noMatchRow.innerHTML = `<div class="queue-col" style="width: 100%; text-align: center;">No match found.</div>`;
        const pendingList = document.getElementById('pending-list');
        pendingList.appendChild(noMatchRow);
    }

    if (searchInput && document.getElementById('pending-list')) {
        searchInput.addEventListener('input', function () {
            const query = this.value.toLowerCase();
            let anyVisible = false;
            // Get all document rows, excluding special rows
            const rows = document.querySelectorAll('#pending-list .queue-row:not(#no-pending-documents-row):not(#no-match-row)');

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(query)) {
                    row.style.display = '';
                    anyVisible = true;
                } else {
                    row.style.display = 'none';
                }
            });

            // Handle empty state and no match state
            if (query === '') {
                if (noDocsRow) noDocsRow.style.display = rows.length === 0 ? '' : 'none';
                if (noMatchRow) noMatchRow.style.display = 'none';
            } else {
                if (noDocsRow) noDocsRow.style.display = 'none';
                if (noMatchRow) noMatchRow.style.display = anyVisible ? 'none' : '';
            }
        });
    }

    // Search Functionality for On-Queue-Documents-List
    const onqueueSearchInput = document.getElementById('onqueue-search');
    const noOnqueueDocsRow = document.getElementById('no-onqueue-documents-row');
    let noOnqueueMatchRow = document.getElementById('no-onqueue-match-row');
    if (!noOnqueueMatchRow && document.querySelector('.on-queue-documents-list')) {
        noOnqueueMatchRow = document.createElement('div');
        noOnqueueMatchRow.className = 'on-queue-row on-queue-empty';
        noOnqueueMatchRow.id = 'no-onqueue-match-row';
        noOnqueueMatchRow.style.display = 'none';
        noOnqueueMatchRow.innerHTML = `<div class="queue-empty-text">No match found.</div>`;
        const onqueueList = document.querySelector('.on-queue-documents-list');
        onqueueList.appendChild(noOnqueueMatchRow);
    }

    if (onqueueSearchInput && document.querySelector('.on-queue-documents-list')) {
        onqueueSearchInput.addEventListener('input', function () {
            const query = this.value.toLowerCase();
            let anyVisible = false;
            // Get all on-queue document rows, excluding special rows
            const onqueueRows = document.querySelectorAll('.on-queue-documents-list .on-queue-row:not(#no-onqueue-documents-row):not(#no-onqueue-match-row)');

            onqueueRows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(query)) {
                    row.style.display = '';
                    anyVisible = true;
                } else {
                    row.style.display = 'none';
                }
            });

            // Handle empty state and no match state
            if (query === '') {
                if (noOnqueueDocsRow) noOnqueueDocsRow.style.display = onqueueRows.length === 0 ? '' : 'none';
                if (noOnqueueMatchRow) noOnqueueMatchRow.style.display = 'none';
            } else {
                if (noOnqueueDocsRow) noOnqueueDocsRow.style.display = 'none';
                if (noOnqueueMatchRow) noOnqueueMatchRow.style.display = anyVisible ? 'none' : '';
            }
        });
    }

    if (window.location.pathname.includes('/portal/settings/')) {

        // NOTIFICATIONS SETTINGS API
        const soundSelect = document.getElementById('notification-sound');
        const enabledToggle = document.getElementById('sound-enabled');
        const previewAudio = document.getElementById('sound-preview');

        // Build a sound map from option data attributes
        const soundMap = {};
        Array.from(soundSelect.options || []).forEach(opt => {
            soundMap[opt.value] = opt.dataset.filepath || '';
        });

        function setPreviewSrc() {
            const selectedSound = soundSelect.value;
            if (selectedSound && soundMap[selectedSound]) {
                previewAudio.src = soundMap[selectedSound];
            }
        }

        // Fetch current settings from server first when page loads
        function fetchNotificationPrefs() {
            console.log("Fetching notification preferences from server...");
            fetch('/api/get-notification-prefs/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken,
                    'Content-Type': 'application/json'
                }
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        console.log("Received notification preferences from server:", data);

                        // Update the UI with server values
                        if (data.sound_slug && soundSelect.querySelector(`option[value="${data.sound_slug}"]`)) {
                            soundSelect.value = data.sound_slug;
                        }
                        enabledToggle.checked = data.sound_enabled;

                        // Update localStorage with server values
                        localStorage.setItem('sound_slug', data.sound_slug);
                        localStorage.setItem('sound_enabled', data.sound_enabled ? 'true' : 'false');

                        // Update preview source
                        setPreviewSrc();

                        console.log("Updated settings from server - Sound enabled:", data.sound_enabled, "Sound slug:", data.sound_slug);
                    } else {
                        console.error("Failed to fetch notification preferences:", data.error);
                    }
                })
                .catch(error => {
                    console.error("Error fetching notification preferences:", error);
                });
        }

        // Fetch preferences from server when settings page loads
        fetchNotificationPrefs();

        function savePrefs(payload, onSuccess) {
            fetch('/api/update-notification-prefs/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        if (typeof createAlert === "function") {
                            createAlert('Success', 'Preferences Updated', 'Your notification preferences have been saved.', 'success', true, true, 'pageMessages');
                        }
                        if (onSuccess) onSuccess(data);
                    } else {
                        if (typeof createAlert === "function") {
                            createAlert('Error', 'Update Failed', data.error || 'Failed to update preferences.', 'danger', true, true, 'pageMessages');
                        } else {
                            alert(data.error || 'Failed to update preferences');
                        }
                    }
                })
                .catch(error => {
                    console.error('Error saving preferences:', error);
                    if (typeof createAlert === "function") {
                        createAlert('Error', 'Update Failed', 'An error occurred while saving preferences.', 'danger', true, true, 'pageMessages');
                    } else {
                        alert('An error occurred while saving preferences.');
                    }
                });
        }

        // Autosave: sound change -> save and auto preview
        soundSelect.addEventListener('change', function () {
            setPreviewSrc();
            // Play preview if enabled
            if (enabledToggle.checked) {
                previewAudio.play().catch(e => console.error("Couldn't play preview:", e));
            }
            // Save sound selection to localStorage
            localStorage.setItem('sound_slug', this.value);

            // Save selection with both sound slug and enabled state to server
            savePrefs({
                sound_slug: this.value,
                sound_enabled: enabledToggle.checked
            });
        });

        // Autosave: enabled toggle
        enabledToggle.addEventListener('change', function () {
            console.log('Toggle changed:', this.checked, soundSelect.value);
            // Save enabled state to localStorage
            localStorage.setItem('sound_enabled', this.checked);

            savePrefs({
                sound_enabled: this.checked,
                sound_slug: soundSelect.value
            });
        });

        // Additional keyboard accessibility
        enabledToggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                enabledToggle.checked = !enabledToggle.checked;
                enabledToggle.dispatchEvent(new Event('change'));
            }
        });
        const enabledLabel = document.querySelector('label[for="sound-enabled"], .switch-label[for="sound-enabled"]');
        if (enabledLabel && enabledLabel.classList.contains('switch-label')) {
            enabledLabel.addEventListener('click', () => {
                enabledToggle.checked = !enabledToggle.checked;
                enabledToggle.dispatchEvent(new Event('change'));
            });
        }

        // Initialize preview state
        setPreviewSrc();
        // Default preview volume
        previewAudio.volume = 1;

        // --- Customer Sound Settings ---
        const custCompletionSelect = document.getElementById('customer-completion-sound');
        const custRerouteSelect = document.getElementById('customer-reroute-sound');
        const custPreviewAudio = document.getElementById('customer-sound-preview');

        function saveCustomerSoundPrefs(payload) {
            fetch('/api/update-customer-sound-prefs/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    createAlert('Success', 'Preferences Updated', 'Customer sound preferences saved.', 'success', true, true, 'pageMessages');
                } else {
                    createAlert('Error', 'Update Failed', data.error || 'Failed to save customer sound.', 'danger', true, true, 'pageMessages');
                }
            })
            .catch(() => {
                createAlert('Error', 'Update Failed', 'An error occurred while saving customer sound.', 'danger', true, true, 'pageMessages');
            });
        }

        if (custCompletionSelect) {
            custCompletionSelect.addEventListener('change', function () {
                const filepath = this.options[this.selectedIndex].dataset.filepath;
                if (filepath && custPreviewAudio) {
                    custPreviewAudio.src = filepath;
                    custPreviewAudio.play().catch(() => {});
                }
                saveCustomerSoundPrefs({ completion_sound: this.value });
            });
        }
        if (custRerouteSelect) {
            custRerouteSelect.addEventListener('change', function () {
                const filepath = this.options[this.selectedIndex].dataset.filepath;
                if (filepath && custPreviewAudio) {
                    custPreviewAudio.src = filepath;
                    custPreviewAudio.play().catch(() => {});
                }
                saveCustomerSoundPrefs({ reroute_sound: this.value });
            });
        }

        const paymentRecipientNameInput = document.getElementById('payment-recipient-name-setting');
        const paymentRecipientNumberInput = document.getElementById('payment-recipient-number-setting');
        const paymentExpiryInput = document.getElementById('payment-expiry-minutes-setting');
        const blockPaymentWhenOfflineInput = document.getElementById('block-payment-when-offline-setting');
        const paymentQrInput = document.getElementById('payment-qr-image-setting');
        const paymentQrPreview = document.getElementById('payment-qr-preview');
        const paymentQrPreviewEmpty = document.getElementById('payment-qr-preview-empty');
        const paymentQrFileName = document.getElementById('payment-qr-file-name');
        const savePaymentGatewayBtn = document.getElementById('save-payment-gateway-btn');

        if (paymentQrInput) {
            paymentQrInput.addEventListener('change', function () {
                const file = this.files && this.files[0];
                if (paymentQrFileName) {
                    paymentQrFileName.textContent = file ? file.name : 'No file chosen';
                }
                if (!file || !paymentQrPreview) return;

                const reader = new FileReader();
                reader.onload = function (event) {
                    paymentQrPreview.src = event.target.result;
                    paymentQrPreview.style.display = 'block';
                    if (paymentQrPreviewEmpty) paymentQrPreviewEmpty.style.display = 'none';
                };
                reader.readAsDataURL(file);
            });
        }

        if (savePaymentGatewayBtn) {
            savePaymentGatewayBtn.addEventListener('click', function () {
                const pageMessages = document.getElementById('pageMessages');
                if (pageMessages) {
                    pageMessages.innerHTML = '';
                }

                const formData = new FormData();
                formData.append('gcash_recipient_name', paymentRecipientNameInput ? paymentRecipientNameInput.value.trim() : '');
                formData.append('gcash_recipient_number', paymentRecipientNumberInput ? paymentRecipientNumberInput.value.trim() : '');
                formData.append('payment_expiry_minutes', paymentExpiryInput ? paymentExpiryInput.value.trim() : '10');
                formData.append('block_payment_when_printers_unavailable', blockPaymentWhenOfflineInput && blockPaymentWhenOfflineInput.checked ? 'true' : 'false');

                if (paymentQrInput && paymentQrInput.files && paymentQrInput.files[0]) {
                    formData.append('gcash_qr_image', paymentQrInput.files[0]);
                }

                savePaymentGatewayBtn.disabled = true;
                savePaymentGatewayBtn.textContent = 'Saving...';

                fetch('/api/update-payment-gateway-settings/', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': csrfToken,
                    },
                    body: formData,
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            if (paymentRecipientNameInput) paymentRecipientNameInput.value = data.payment_config.recipient_name || '';
                            if (paymentRecipientNumberInput) paymentRecipientNumberInput.value = data.payment_config.recipient_number || '';
                            if (paymentExpiryInput) paymentExpiryInput.value = data.payment_config.payment_expiry_minutes || '10';
                            if (paymentQrPreview && data.payment_config.recipient_qr_url) {
                                paymentQrPreview.src = data.payment_config.recipient_qr_url;
                                paymentQrPreview.style.display = 'block';
                                if (paymentQrPreviewEmpty) paymentQrPreviewEmpty.style.display = 'none';
                            }
                            createAlert('Success', 'Payment Gateway Updated', 'GCash recipient settings have been saved.', 'success', true, true, 'pageMessages');
                        } else {
                            createAlert('Error', 'Update Failed', data.error || 'Failed to update payment gateway settings.', 'danger', true, true, 'pageMessages');
                        }
                    })
                    .catch(() => {
                        createAlert('Error', 'Update Failed', 'An error occurred while saving payment gateway settings.', 'danger', true, true, 'pageMessages');
                    })
                    .finally(() => {
                        savePaymentGatewayBtn.disabled = false;
                        savePaymentGatewayBtn.textContent = 'Save Payment Gateway';
                    });
            });
        }
    }

        const salesFullThresholdInput = document.getElementById('sales-full-threshold-setting');
        const salesBwPrice70Input = document.getElementById('sales-bw-price-70-setting');
        const salesBwPrice80Input = document.getElementById('sales-bw-price-80-setting');
        const salesPartialColorPriceInput = document.getElementById('sales-partial-color-price-setting');
        const salesFullColorPriceInput = document.getElementById('sales-full-color-price-setting');
        const salesThresholdRuleText = document.getElementById('sales-threshold-rule-text');
        const editSalesPricingBtn = document.getElementById('edit-sales-pricing-btn');
        const salesPricingCard = document.querySelector('.sales-pricing-card');
        const salesPricingInputs = [salesFullThresholdInput, salesBwPrice70Input, salesBwPrice80Input, salesPartialColorPriceInput, salesFullColorPriceInput].filter(Boolean);
        let salesPricingOriginalValues = null;

        const formatThresholdPercent = (value) => {
            const numericValue = Number.parseFloat(value);
            if (Number.isNaN(numericValue)) return '0';
            return String(Math.round(numericValue));
        };

        const getSalesPricingValues = () => ({
            color_full_threshold_percent: salesFullThresholdInput ? formatThresholdPercent(salesFullThresholdInput.value) : '10',
            bw_price_70: salesBwPrice70Input ? salesBwPrice70Input.value.trim() : '1',
            bw_price_80: salesBwPrice80Input ? salesBwPrice80Input.value.trim() : '2',
            partial_color_price: salesPartialColorPriceInput ? salesPartialColorPriceInput.value.trim() : '2',
            full_color_price: salesFullColorPriceInput ? salesFullColorPriceInput.value.trim() : '5',
        });

        const syncSalesThresholdValue = () => {
            const thresholdValue = formatThresholdPercent(salesFullThresholdInput ? salesFullThresholdInput.value : '10');
            if (salesFullThresholdInput) {
                salesFullThresholdInput.value = thresholdValue;
            }
            if (salesThresholdRuleText) {
                salesThresholdRuleText.textContent = `Partial Color: above 0% and below ${thresholdValue}%. Full Color: ${thresholdValue}% and above.`;
            }
        };

        const setSalesPricingButtonState = (mode, isBusy = false) => {
            if (!editSalesPricingBtn) {
                return;
            }

            editSalesPricingBtn.dataset.mode = mode;
            editSalesPricingBtn.disabled = isBusy;
            editSalesPricingBtn.textContent = isBusy ? 'Saving...' : (mode === 'save' ? 'Save Changes' : 'Edit Pricing Rules');
        };

        const setSalesPricingEditing = (isEditing) => {
            salesPricingInputs.forEach((input) => {
                input.disabled = !isEditing;
            });

            if (salesPricingCard) {
                salesPricingCard.classList.toggle('is-editing', isEditing);
            }

            setSalesPricingButtonState(isEditing ? 'save' : 'edit');
        };

        const applySalesPricingConfig = (pricingConfig) => {
            const savedThresholdValue = formatThresholdPercent(pricingConfig.color_full_threshold_percent || '10');
            if (salesFullThresholdInput) salesFullThresholdInput.value = savedThresholdValue;
            if (salesBwPrice70Input) salesBwPrice70Input.value = pricingConfig.bw_price_70 || '1';
            if (salesBwPrice80Input) salesBwPrice80Input.value = pricingConfig.bw_price_80 || '2';
            if (salesPartialColorPriceInput) salesPartialColorPriceInput.value = pricingConfig.partial_color_price || '2';
            if (salesFullColorPriceInput) salesFullColorPriceInput.value = pricingConfig.full_color_price || '5';
            syncSalesThresholdValue();
        };

        if (salesFullThresholdInput) {
            syncSalesThresholdValue();
            salesFullThresholdInput.addEventListener('input', syncSalesThresholdValue);
            salesFullThresholdInput.addEventListener('change', syncSalesThresholdValue);
        }

        if (salesPricingInputs.length) {
            salesPricingOriginalValues = getSalesPricingValues();
            setSalesPricingEditing(false);
        }

        if (editSalesPricingBtn) {
            editSalesPricingBtn.addEventListener('click', function () {
                const pageMessages = document.getElementById('pageMessages');
                if (pageMessages) {
                    pageMessages.innerHTML = '';
                }

                if (editSalesPricingBtn.dataset.mode !== 'save') {
                    salesPricingOriginalValues = getSalesPricingValues();
                    setSalesPricingEditing(true);
                    if (salesFullThresholdInput) {
                        salesFullThresholdInput.focus();
                    }
                    return;
                }

                const currentPricingValues = getSalesPricingValues();
                if (salesPricingOriginalValues && JSON.stringify(currentPricingValues) === JSON.stringify(salesPricingOriginalValues)) {
                    setSalesPricingEditing(false);
                    return;
                }

                const formData = new FormData();
                formData.append('color_full_threshold_percent', currentPricingValues.color_full_threshold_percent);
                formData.append('bw_price_70', currentPricingValues.bw_price_70);
                formData.append('bw_price_80', currentPricingValues.bw_price_80);
                formData.append('partial_color_price', currentPricingValues.partial_color_price);
                formData.append('full_color_price', currentPricingValues.full_color_price);

                setSalesPricingButtonState('save', true);

                fetch('/api/update-pricing-settings/', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': csrfToken,
                    },
                    body: formData,
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            applySalesPricingConfig(data.pricing_config || {});
                            salesPricingOriginalValues = getSalesPricingValues();
                            setSalesPricingEditing(false);
                            createAlert('Success', 'Pricing Updated', 'Sales pricing rules have been saved.', 'success', true, true, 'pageMessages');
                        } else {
                            setSalesPricingButtonState('save');
                            createAlert('Error', 'Update Failed', data.error || 'Failed to update pricing rules.', 'danger', true, true, 'pageMessages');
                        }
                    })
                    .catch(() => {
                        setSalesPricingButtonState('save');
                        createAlert('Error', 'Update Failed', 'An error occurred while saving pricing rules.', 'danger', true, true, 'pageMessages');
                    });
            });
        }

    // Printer Search Functionality
    const printerSearchInput = document.getElementById('printer-search');
    const tableRows = document.querySelectorAll('.printer-table-row');
    if (printerSearchInput && tableRows.length) {
        // Optional: Add a "no match" row if not present
        let printerNoMatchRow = document.getElementById('no-printer-match-row');
        if (!printerNoMatchRow) {
            printerNoMatchRow = document.createElement('div');
            printerNoMatchRow.className = 'printer-table-row';
            printerNoMatchRow.id = 'no-printer-match-row';
            printerNoMatchRow.style.display = 'none';
            printerNoMatchRow.innerHTML = `<div style="width: 100%; text-align: center; grid-column: 1 / -1;">No match found.</div>`;
            document.querySelector('.printer-table').appendChild(printerNoMatchRow);
        }

        printerSearchInput.addEventListener('input', function () {
            const query = this.value.trim().toLowerCase();
            let anyVisible = false;
            tableRows.forEach(row => {
                const name = row.querySelector('.printer-name')?.textContent.toLowerCase() || '';
                const serial = row.children[1]?.textContent.toLowerCase() || '';
                if (name.includes(query) || serial.includes(query)) {
                    row.style.display = '';
                    anyVisible = true;
                } else {
                    row.style.display = 'none';
                }
            });
            printerNoMatchRow.style.display = (query && !anyVisible) ? '' : 'none';
        });
    }

    // --- Resolved tickets toggle ---
    const toggleBtn = document.getElementById('toggle-resolved');
    const resolvedContainer = document.getElementById('resolved-list-container');
    if (toggleBtn && resolvedContainer) {
        toggleBtn.addEventListener('click', function() {
            const expanded = this.getAttribute('aria-expanded') === 'true';
            this.setAttribute('aria-expanded', !expanded);
            resolvedContainer.style.display = expanded ? 'none' : '';
        });
    }

    // --- Purge ticket data button ---
    document.querySelectorAll('.purge-ticket-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const ticketId = this.dataset.ticketId;
            if (!confirm('Permanently delete all customer data for this ticket? This cannot be undone.')) return;
            fetch('/portal/api/purge-ticket-data/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': typeof csrfToken !== 'undefined' ? csrfToken : ''
                },
                body: JSON.stringify({ ticket_id: parseInt(ticketId, 10) })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const row = this.closest('.resolved-row');
                    if (row) {
                        row.querySelector('.resolved-customer').textContent = '[Purged]';
                        row.querySelector('.resolved-email').textContent = '';
                    }
                    this.replaceWith(Object.assign(document.createElement('span'), {
                        textContent: 'Purged',
                        style: 'font-size:0.75rem; color:#999; font-family:Montserrat,sans-serif;'
                    }));
                } else {
                    alert(data.error || 'Failed to purge data');
                }
            });
        });
    });

    // --- Initialize pagination for dashboard tables ---
    setupPagination('document-results', '.document-item:not(.empty-row)', 'active-tickets-pagination', 5);
    // Resolved tickets pagination works when container is shown
    var resolvedPg = setupPagination('resolved-list-container', '.resolved-row', 'resolved-tickets-pagination', 5);
    if (resolvedPg && toggleBtn) {
        var origClick = toggleBtn.onclick;
        toggleBtn.addEventListener('click', function() {
            setTimeout(function() { if (resolvedPg) resolvedPg.render(); }, 50);
        });
    }

    // --- Queue page pagination ---
    if (document.getElementById('queue-rows-container')) {
        setupPagination('queue-rows-container', '.on-queue-row:not(.on-queue-empty)', 'queue-pagination', 5);
    }

    // --- Completed page pagination (per printer card) ---
    document.querySelectorAll('[id^="completed-scroll-"]').forEach(function(el) {
        var idx = el.id.replace('completed-scroll-', '');
        setupPagination(el.id, '.completed-row:not(.completed-empty)', 'completed-pagination-' + idx, 5);
    });

}); // End of DOMContentLoaded event listener


function toggleActionButtons(showActions) {
    var searchBtn = document.getElementById('search-btn');
    var approvalActions = document.getElementById('approval-actions');
    if (showActions) {
        if (searchBtn) searchBtn.style.display = 'none';
        if (approvalActions) approvalActions.style.display = 'flex';
    } else {
        if (searchBtn) searchBtn.style.display = '';
        if (approvalActions) approvalActions.style.display = 'none';
    }
}

function showPopupOverlay(id) {
    var overlay = document.getElementById(id);
    if (overlay) overlay.style.display = 'flex';
}
function hidePopupOverlay(id) {
    var overlay = document.getElementById(id);
    if (overlay) overlay.style.display = 'none';
}

function showEditUserPasswordOverlay(userId, userName) {
    document.getElementById('edit-user-password-id').value = userId;
    document.getElementById('edit-user-password-name').textContent = userName;
    showPopupOverlay('editUserPasswordOverlay');
}

function showDeleteUserOverlay(userId, userName) {
    if (Array.isArray(userId)) {
        selectedIds = userId;
        document.getElementById('delete-user-id').value = userId.join(',');
        document.getElementById('delete-user-name').textContent = userName;
    } else {
        selectedIds = [userId];
        document.getElementById('delete-user-id').value = userId;
        document.getElementById('delete-user-name').textContent = userName;
    }
    showPopupOverlay('deleteUserOverlay');
}

let lastDocuments = [];

function displayDocuments(documents, total_price) {
    lastDocuments = documents; // Store for filtering

    document.getElementById('price-to-pay').textContent = '₱' + (total_price || 0).toFixed(2);

    const resultsDiv = document.getElementById('document-results');
    if (!resultsDiv) return;

    // Remove previous document items and no-documents message
    Array.from(resultsDiv.querySelectorAll('.document-item, .no-documents')).forEach(el => el.remove());

    const searchBar = resultsDiv.querySelector('.search-bar');
    const docTitle = resultsDiv.querySelector('.document-item-title');


    // Show the search bar and document title
    if (searchBar) searchBar.style.display = 'flex';
    if (docTitle) docTitle.style.display = 'flex';

    // Render all documents initially
    renderDocumentItems(documents, resultsDiv);

    // Attach filter event to the dashboard search input
    const dashboardSearchInput = document.getElementById('dashboard-search');
    if (dashboardSearchInput) {
        dashboardSearchInput.value = '';
        dashboardSearchInput.oninput = function () {
            const filter = dashboardSearchInput.value.trim().toLowerCase();
            const filteredDocs = lastDocuments.filter(doc =>
                (doc.filename || '').toLowerCase().includes(filter) ||
                (doc.doc_id || '').toLowerCase().includes(filter) ||
                (doc.ticket_number || '').toLowerCase().includes(filter) ||
                (doc.customer_id || '').toLowerCase().includes(filter)
            );
            renderDocumentItems(filteredDocs, resultsDiv);
        };
    }
}

function renderDocumentItems(documents, resultsDiv) {
    // Remove previous document items and no-documents message
    Array.from(resultsDiv.querySelectorAll('.document-item, .no-documents')).forEach(el => el.remove());
    let html = '';
    documents.forEach(doc => {
        const ticketNumber = doc.ticket_number || doc.doc_id || '';
        const customerId = doc.customer_id ? `#${doc.customer_id.replace('#', '')}` : '';
        const timeSubmitted = doc.time_submitted || '';
        const documentId = doc.document_id || doc.doc_id || '';
        const price = Number.parseFloat(doc.price || 0);
        html += `
        <div class="document-item" data-doc-id="${doc.doc_id}">
            <div class="ticket-cell">
                <img src="/static/assets/pdf-icon.svg" alt="Ticket">
                <div class="ticket-meta">
                    <h6 title="${ticketNumber}">${ticketNumber}</h6>
                    <span>₱${price.toFixed(2)}</span>
                </div>
            </div>
            <div class="ticket-customer">${customerId}</div>
            <div class="ticket-date">${timeSubmitted}</div>
            <div class="ticket-doc">${documentId}</div>
            <div class="actions">
                <button class="deny-btn" type="button">Void</button>
                <button class="approve-btn" type="button">Verify</button>
                <button class="refund-btn" type="button">Refund</button>
            </div>
        </div>
        `;
    });
    if (documents.length === 0) {
        html = `
            <div class="no-documents">
                <img src="/static/assets/no-documents.png" alt="No Documents">
                <p>No documents found for this search.</p>
            </div>
        `;
    }
    resultsDiv.insertAdjacentHTML('beforeend', html);

    // Attach event listeners to each deny button
    resultsDiv.querySelectorAll('.document-item .deny-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const docItem = btn.closest('.document-item');
            const docId = docItem.getAttribute('data-doc-id');
            fetch('/api/deny-document/', {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        createAlert('Success', 'Denied', 'Document denied.', 'success', true, true, 'pageMessages');
                        docItem.remove();

                        // Recalculate total price
                        let total = 0;
                        resultsDiv.querySelectorAll('.document-item .ticket-meta span').forEach(span => {
                            total += parseFloat(span.textContent.replace('₱', '')) || 0;
                        });
                        const priceDisplay = document.getElementById('price-to-pay');
                        if (priceDisplay) priceDisplay.textContent = '₱' + total.toFixed(2);

                        // If no more documents, clear everything and hide search/title
                        if (resultsDiv.querySelectorAll('.document-item').length === 0) {
                            if (typeof clearCustomerIdAndPrice === 'function') {
                                clearCustomerIdAndPrice();
                            }
                            const searchBar = resultsDiv.querySelector('.search-bar');
                            const docTitle = resultsDiv.querySelector('.document-item-title');
                            if (searchBar) searchBar.style.display = 'none';
                            if (docTitle) docTitle.style.display = 'none';
                            Array.from(resultsDiv.querySelectorAll('.no-documents')).forEach(el => el.remove());
                            resultsDiv.innerHTML += `
                            <div class="no-documents">
                                <img src="/static/assets/no-documents.png" alt="No Documents">
                                <p>No documents found, Please enter a Customer ID</p>
                            </div>
                        `;
                        }
                    } else {
                        createAlert('Error', 'Deny Failed', data.error || 'Unknown error.', 'danger', true, true, 'pageMessages');
                    }
                })
                .catch(error => {
                    createAlert('Error', 'Deny Failed', 'An error occurred while denying the document.', 'danger', true, true, 'pageMessages');
                });
        });
    });

    // Attach event listeners to each approve button
    resultsDiv.querySelectorAll('.document-item .approve-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const docItem = btn.closest('.document-item');
            const docId = docItem.getAttribute('data-doc-id');
            fetch('/api/approve-document/', {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        createAlert('Success', 'Approved', 'Document approved.', 'success', true, true, 'pageMessages');
                        docItem.remove();

                        // Recalculate total price
                        let total = 0;
                        resultsDiv.querySelectorAll('.document-item .ticket-meta span').forEach(span => {
                            total += parseFloat(span.textContent.replace('₱', '')) || 0;
                        });
                        const priceDisplay = document.getElementById('price-to-pay');
                        if (priceDisplay) priceDisplay.textContent = '₱' + total.toFixed(2);

                        // If no more documents, clear everything
                        if (resultsDiv.querySelectorAll('.document-item').length === 0) {
                            if (typeof clearCustomerIdAndPrice === 'function') {
                                clearCustomerIdAndPrice();
                            }
                            const searchBar = resultsDiv.querySelector('.search-bar');
                            const docTitle = resultsDiv.querySelector('.document-item-title');
                            if (searchBar) searchBar.style.display = 'none';
                            if (docTitle) docTitle.style.display = 'none';
                            Array.from(resultsDiv.querySelectorAll('.no-documents')).forEach(el => el.remove());
                            resultsDiv.innerHTML += `
                            <div class="no-documents">
                                <img src="/static/assets/no-documents.png" alt="No Documents">
                                <p>No documents found, Please enter a Customer ID</p>
                            </div>
                        `;
                        }
                    } else {
                        createAlert('Error', 'Approve Failed', data.error || 'Unknown error.', 'danger', true, true, 'pageMessages');
                    }
                })
                .catch(error => {
                    createAlert('Error', 'Approve Failed', 'An error occurred while approving the document.', 'danger', true, true, 'pageMessages');
                });
        });
    });
}

// Auto-clear CID and Price
function clearCustomerIdAndPrice() {
    const customerInput = document.getElementById('customer-id-input');
    const priceDisplay = document.getElementById('price-to-pay');
    if (customerInput) customerInput.value = '';
    if (priceDisplay) priceDisplay.textContent = '₱0.00';
    toggleActionButtons(false);
}

document.addEventListener('DOMContentLoaded', function () {
    // Deny button for pending documents
    document.querySelectorAll('.queue-deny-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const row = btn.closest('.queue-row');
            let docId = null;
            if (row.id.startsWith('pending-doc-')) {
                docId = row.id.replace('pending-doc-', '');
            } else if (row.id.startsWith('onqueue-doc-')) {
                docId = row.id.replace('onqueue-doc-', '');
            }
            fetch('/api/deny-document/', {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        row.remove();
                        if (typeof createAlert === "function") {
                            createAlert('Success', 'Denied', 'Document denied.', 'success', true, true, 'pageMessages');
                        }

                        // When updating the pending list (e.g., after approve/deny):
                        const pendingList = document.getElementById('pending-list');
                        const noMatchRow = document.getElementById('no-match-row');
                        if (pendingList && noMatchRow) {
                            // Only count actual pending docs, not the empty/match rows
                            const remainingRows = pendingList.querySelectorAll('.queue-row[id^="pending-doc-"]');
                            if (remainingRows.length === 0) {
                                noMatchRow.style.display = 'flex';
                            } else {
                                noMatchRow.style.display = 'none';
                            }
                        }

                    } else {
                        alert('Deny failed: ' + (data.error || 'Unknown error.'));
                    }
                })
                .catch(() => alert('An error occurred while denying the document.'));
        });
    });

    // Approve button for pending documents
    document.querySelectorAll('.queue-approve-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const row = btn.closest('.queue-row');
            let docId = null;
            if (row.id.startsWith('pending-doc-')) {
                docId = row.id.replace('pending-doc-', '');
            } else if (row.id.startsWith('onqueue-doc-')) {
                docId = row.id.replace('onqueue-doc-', '');
            }
            fetch('/api/approve-document/', {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        // Remove from pending
                        row.remove();
                        if (typeof createAlert === "function") {
                            createAlert('Success', 'Approved', 'Document approved.', 'success', true, true, 'pageMessages');
                        }

                        // When updating the pending list (e.g., after approve/deny):
                        const pendingList = document.getElementById('pending-list');
                        let noPendingRow = document.getElementById('no-pending-documents-row');
                        if (pendingList) {
                            const remainingRows = pendingList.querySelectorAll('.queue-row[id^="pending-doc-"]');
                            if (remainingRows.length === 0) {
                                if (!noPendingRow) {
                                    noPendingRow = document.createElement('div');
                                    noPendingRow.className = 'queue-row';
                                    noPendingRow.id = 'no-pending-documents-row';
                                    noPendingRow.style.display = 'flex';
                                    noPendingRow.innerHTML = `<div class="queue-col" style="width: 100%; text-align: center;">No pending documents.</div>`;
                                    pendingList.appendChild(noPendingRow);
                                } else {
                                    noPendingRow.style.display = 'flex';
                                }
                            } else if (noPendingRow) {
                                noPendingRow.style.display = 'none';
                            }
                        }

                        // Remove "No documents in queue." if present
                        const onQueueList = document.querySelector('.on-queue-documents-list');
                        const noOnqueueRow = document.getElementById('no-onqueue-documents-row');
                        if (noOnqueueRow) {
                            noOnqueueRow.remove();
                        }

                        // Add the newly approved document to On Queue Documents
                        if (onQueueList) {
                            const filename = row.querySelector('.doc-title').textContent;
                            const price = row.querySelector('.doc-price') ? row.querySelector('.doc-price').textContent : '';
                            const docIdText = row.querySelector('.queue-col.doc-id').textContent;
                            const customerId = row.querySelector('.queue-col.doc-customer') ? row.querySelector('.queue-col.doc-customer').textContent : '';

                            const newRow = document.createElement('div');
                            newRow.className = 'on-queue-row';
                            newRow.id = 'onqueue-doc-' + docId;
                            newRow.innerHTML = `
                            <div class="queue-col doc-name">
                                <img src="/static/assets/pdf-icon.svg" alt="PDF Icon" class="pdf-icon">
                                <div class="doc-info">
                                    <div class="doc-title" title="${filename}">${filename}</div>
                                    <div class="doc-price">${price}</div>
                                </div>
                            </div>
                            <div class="queue-col doc-printer">
                                <div>
                                    <span class="printer-status printer-queued"></span>
                                    No Printer Assigned (Queued)
                                </div>
                            </div>
                            <div class="queue-col doc-approved">${data.admin_name ? data.admin_name : '-'}</div>
                            <div class="queue-col doc-id">${docIdText}</div>
                            <div class="queue-col doc-customer">${customerId}</div>
                            <div class="queue-col doc-actions">
                                <button class="queue-cancel-btn">Cancel</button>
                            </div>
                        `;
                            onQueueList.appendChild(newRow);

                            // Attach cancel event to the new cancel button
                            const cancelBtn = newRow.querySelector('.queue-cancel-btn');
                            if (cancelBtn) {
                                cancelBtn.addEventListener('click', function () {
                                    const row = cancelBtn.closest('.on-queue-row');
                                    let docId = null;
                                    if (row && row.id.startsWith('onqueue-doc-')) {
                                        docId = row.id.replace('onqueue-doc-', '');
                                    }
                                    if (!docId) return;
                                    fetch('/api/deny-document/', {
                                        method: "POST",
                                        headers: {
                                            "X-CSRFToken": csrfToken,
                                            "Content-Type": "application/json"
                                        },
                                        body: JSON.stringify({ doc_id: docId })
                                    })
                                        .then(response => response.json())
                                        .then(data => {
                                            if (data.success) {
                                                row.remove();
                                                if (typeof createAlert === "function") {
                                                    createAlert('Success', 'Cancelled', 'Document cancelled.', 'success', true, true, 'pageMessages');
                                                }
                                                updateOnQueueEmptyState();
                                            } else {
                                                alert('Cancel failed: ' + (data.error || 'Unknown error.'));
                                            }
                                        })
                                        .catch(() => alert('An error occurred while cancelling the document.'));
                                });
                            }
                        }
                    } else {
                        alert('Approve failed: ' + (data.error || 'Unknown error.'));
                    }
                })
                .catch(() => alert('An error occurred while approving the document.'));
        });
    });

    // Cancel button for on-queue documents
    document.querySelectorAll('.queue-cancel-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const row = btn.closest('.on-queue-row');
            let docId = null;
            if (row && row.id.startsWith('onqueue-doc-')) {
                docId = row.id.replace('onqueue-doc-', '');
            }
            if (!docId) return;
            fetch('/api/deny-document/', {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        row.remove();
                        if (typeof createAlert === "function") {
                            createAlert('Success', 'Cancelled', 'Document cancelled.', 'success', true, true, 'pageMessages');
                        }
                        updateOnQueueEmptyState();
                    } else {
                        alert('Cancel failed: ' + (data.error || 'Unknown error.'));
                    }
                })
                .catch(() => alert('An error occurred while cancelling the document.'));
        });
    });

    // Handed Over button for completed documents
    document.querySelectorAll('.handed-over-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const row = btn.closest('.completed-row');
            const docId = row ? row.getAttribute('data-doc-id') : null;
            if (!docId) return;
            fetch('/api/deny-document/', {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const printerCard = row.closest('.completed-printer-card');
                        row.remove();

                        // Check if there are any more completed jobs for this printer
                        const remainingRows = printerCard.querySelectorAll('.completed-row[data-doc-id]');
                        if (remainingRows.length === 0) {
                            // Add the empty state for this printer
                            const emptyDiv = document.createElement('div');
                            emptyDiv.className = 'completed-row completed-empty';
                            emptyDiv.innerHTML = `
                            <img src="/static/assets/all-completed.png" alt="All Completed" class="all-completed">
                            <div class="completed-empty-text">All jobs handed over!</div>
                        `;
                            printerCard.appendChild(emptyDiv);
                        }

                        if (typeof createAlert === "function") {
                            createAlert('Success', 'Handed Over', 'Document handed over.', 'success', true, true, 'pageMessages');
                        }
                    } else {
                        alert('Failed: ' + (data.error || 'Unknown error.'));
                    }
                })
                .catch(() => alert('An error occurred while marking as handed over.'));
        });
    });

    // Handled Done button for completed jobs (dashboard)
    document.addEventListener('click', function (e) {
        if (e.target && e.target.classList.contains('jobs-done-btn')) {
            const btn = e.target;
            const wrapper = btn.closest('.jobs-item-wrapper');
            const jobsItem = wrapper ? wrapper.parentElement : null;
            const docId = btn.getAttribute('data-doc-id');
            if (!docId) return;
            fetch('/api/deny-document/', {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        if (wrapper) wrapper.remove();

                        // If no more jobs, show the empty state
                        if (jobsItem && jobsItem.querySelectorAll('.jobs-item-wrapper').length === 0) {
                            jobsItem.innerHTML = `
                            <div class="no-jobs">
                                <img src="/static/assets/empty-jobs.png" alt="Completed Jobs">
                                <p>All Completed!</p>
                            </div>
                        `;
                            // Hide the completedJobs-item-title if present
                            const title = document.querySelector('.completedJobs-item-title');
                            if (title) title.style.display = 'none';
                        }

                        if (typeof createAlert === "function") {
                            createAlert('Success', 'Handed Over', 'Document handed over.', 'success', true, true, 'pageMessages');
                        }
                    } else {
                        alert('Failed: ' + (data.error || 'Unknown error.'));
                    }
                })
                .catch(() => alert('An error occurred while marking as handed over.'));
        }
    });

    // Function to update printer status in the UI
    function update_printer(printer) {
        // Find the printer row by its ID
        const row = document.querySelector(`.printer-table-row [data-printer-id="${printer.id}"]`)?.closest('.printer-table-row') ||
            Array.from(document.querySelectorAll('.printer-table-row')).find(row => {
                const printerName = row.querySelector('.printer-name')?.textContent?.trim();
                return printerName === printer.printer_name;
            });

        if (!row) return; // Printer not found in the UI

        // Update printer name and model
        const printerNameElement = row.querySelector('.printer-name');
        if (printerNameElement) {
            printerNameElement.textContent = printer.printer_name;
        }

        const printerModelElement = row.querySelector('.printer-model');
        if (printerModelElement) {
            printerModelElement.textContent = printer.model_name;
        }

        // Update IP address
        const ipElement = row.children[1];
        if (ipElement) {
            ipElement.textContent = printer.ip_address;
        }

        // Update Node name
        const nodeElement = row.children[2];
        if (nodeElement) {
            nodeElement.textContent = printer.node_name;
        }

        // Update status dot and text
        const statusDot = row.querySelector('.status-dot');
        if (statusDot) {
            statusDot.classList.remove('ready', 'sleep', 'printing', 'error');
            if (printer.printer_status === 'Ready') statusDot.classList.add('ready');
            else if (printer.printer_status === 'Sleep') statusDot.classList.add('sleep');
            else if (printer.printer_status === 'Printing') statusDot.classList.add('printing');
            else statusDot.classList.add('error');

            const statusContainer = statusDot.parentElement;
            if (statusContainer) {
                let node = statusDot.nextSibling;
                while (node) {
                    const nextNode = node.nextSibling;
                    if (node.nodeType === 3 || node.tagName !== 'SPAN') {
                        statusContainer.removeChild(node);
                    }
                    node = nextNode;
                }
                statusContainer.appendChild(document.createTextNode(' ' + printer.printer_status));
            }
        }

        // Update ink bars
        const inkBarsContainer = row.querySelector('.ink-bars');
        if (inkBarsContainer) {
            inkBarsContainer.innerHTML = '';

            if (printer.ink_status === 'N/A') {
                // For N/A status (Offline printer), show no ink bars and black text
                const inkStatusSpan = row.querySelector('.ink-status');
                if (inkStatusSpan) {
                    inkStatusSpan.textContent = 'N/A';
                    inkStatusSpan.className = 'ink-status';
                    inkStatusSpan.style.color = '#000000'; // Black font
                }
            } else if (printer.ink_status === 'OK') {
                // For OK status, show all colors (b, y, c, m)
                ['b', 'y', 'c', 'm'].forEach(color => {
                    const inkSpan = document.createElement('span');
                    inkSpan.className = 'ink ' + color;
                    inkSpan.title = 'OK';
                    inkBarsContainer.appendChild(inkSpan);
                });

                const inkStatusSpan = row.querySelector('.ink-status');
                if (inkStatusSpan) {
                    inkStatusSpan.textContent = 'OK';
                    inkStatusSpan.className = 'ink-status ok';
                    inkStatusSpan.style.removeProperty('color'); // Use default color from class
                }
            } else if (printer.ink_status && printer.ink_status !== 'OK') {
                // For LOW INK status, only show the specific colors listed
                const lowColors = printer.ink_status.split(',');
                lowColors.forEach(color => {
                    color = color.trim().toLowerCase();
                    if (color) {
                        // Map color names to their abbreviations
                        const colorMap = { 'black': 'b', 'yellow': 'y', 'cyan': 'c', 'magenta': 'm' };
                        const className = colorMap[color] || color;

                        const inkSpan = document.createElement('span');
                        inkSpan.className = 'ink ' + className;
                        inkSpan.title = 'LOW';
                        inkBarsContainer.appendChild(inkSpan);
                    }
                });

                const inkStatusSpan = row.querySelector('.ink-status');
                if (inkStatusSpan) {
                    inkStatusSpan.textContent = 'LOW INK';
                    inkStatusSpan.className = 'ink-status low';
                    inkStatusSpan.style.removeProperty('color'); // Use default color from class
                }
            }
        }

        // Update paper assigned and GSM dropdowns if needed
        if (printer.paper_assigned) {
            const paperSelect = row.querySelector('select[data-field="paper_assigned"]');
            if (paperSelect) {
                paperSelect.value = printer.paper_assigned;
            }
        }

        if (printer.paper_quality) {
            const gsmSelect = row.querySelector('select[data-field="paper_quality"]');
            if (gsmSelect) {
                gsmSelect.value = printer.paper_quality;
            }
        }
    }

    // SSE for real-time printer status and ink updates
    // Track active SSE connections for cleanup on page unload
    var _activeSSE = [];
    window.addEventListener('pagehide', function() {
        _activeSSE.forEach(function(src) { try { src.close(); } catch(e){} });
        _activeSSE.length = 0;
    });

    if (window.location.pathname.includes('/portal/status/')) {
        console.log('Setting up SSE connection for printer status...');

        function setupPrinterSSE() {
            let evtSource = new EventSource('/sse/printer-status/');
            _activeSSE.push(evtSource);

            evtSource.onopen = function () {
                console.log('SSE connection opened successfully');
            };

            evtSource.onerror = function () {
                // SSE auto-reconnects; only close and retry if connection is fully closed
                if (evtSource.readyState === EventSource.CLOSED) {
                    console.warn('SSE connection closed, reconnecting in 5s...');
                    evtSource.close();
                    setTimeout(setupPrinterSSE, 5000);
                }
            };

            evtSource.onmessage = function (event) {
                try {
                    const data = JSON.parse(event.data);
                    // Flexibly handle different data formats
                    const printers = Array.isArray(data) ? data : (data.printers || []);

                    // Update each printer in the UI
                    printers.forEach(printer => {
                        update_printer(printer);
                    });
                } catch (e) {
                    console.error('SSE parse error:', e, event.data);
                }
            };
        }

        setupPrinterSSE();
    }

    // Global SSE for dashboard stats across all portal pages (for tab title flashing).
    if (window.location.pathname.startsWith('/portal/')) {
        let baseTitle = document.title;
        let titleFlashInterval = null;
        let previousCompletedCount = 0; // unused, kept for compat
        let previousActiveTicketCount = null; // Track ticket count for sound on all pages
        let previousPrinterErrorCount = null; // Track printer errors for sound notifications

        // Create notification audio element
        const notificationAudio = new Audio();

        // Initialize sound settings from server on page load
        function initSoundSettings() {
            fetch('/api/get-notification-prefs/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken,
                    'Content-Type': 'application/json'
                }
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        localStorage.setItem('sound_slug', data.sound_slug || 'chime');
                        localStorage.setItem('sound_enabled', data.sound_enabled ? 'true' : 'false');
                    } else {
                        console.error("Failed to fetch sound settings:", data.error);
                    }
                })
                .catch(error => {
                    console.error("Error fetching sound settings:", error);
                });
        }

        initSoundSettings();

        // Request notification permission if we haven't asked before
        function requestNotificationPermission() {
            if ("Notification" in window && Notification.permission === "default") {
                Notification.requestPermission().then(permission => {
                    console.log("Notification permission:", permission);
                });
            }
        }

        // Request permission when dashboard page loads
        if (window.location.pathname.includes('/portal/dashboard')) {
            requestNotificationPermission();
        }

        function playNotificationSound() {
            // Helper that attempts to play via <audio> then falls back to WebAudio
            function tryPlayAudio(path) {
                return new Promise((resolve, reject) => {
                    try {
                        notificationAudio.src = path;
                        notificationAudio.volume = 1.0;
                        const p = notificationAudio.play();
                        if (p && typeof p.then === 'function') {
                            p.then(() => resolve('audio'))
                                .catch(err => reject(err));
                        } else {
                            // If play returned undefined, assume success
                            resolve('audio');
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            }

            function tryWebAudio(path) {
                return new Promise((resolve, reject) => {
                    try {
                        const AudioContext = window.AudioContext || window.webkitAudioContext;
                        if (!AudioContext) return reject(new Error('WebAudio not supported'));
                        const ctx = new AudioContext();
                        Promise.resolve(ctx.state === 'suspended' ? ctx.resume() : ctx)
                            .then(() => fetch(path))
                            .then(res => res.arrayBuffer())
                            .then(buf => ctx.decodeAudioData(buf))
                            .then(decoded => {
                                const src = ctx.createBufferSource();
                                src.buffer = decoded;
                                src.connect(ctx.destination);
                                try {
                                    src.start(0);
                                    resolve('webaudio');
                                } catch (e) {
                                    reject(e);
                                }
                            })
                            .catch(reject);
                    } catch (e) {
                        reject(e);
                    }
                });
            }

            function playIfEnabled(path) {
                // Prefer <audio> element first, then WebAudio fallback
                return tryPlayAudio(path).catch(err => {
                    console.warn('Audio element play failed, trying WebAudio fallback:', err);
                    return tryWebAudio(path);
                });
            }

            function runPlay(soundSlug) {
                if (!soundSlug) soundSlug = 'chime';
                const soundPath = `/static/sounds/${soundSlug}.mp3`;
                playIfEnabled(soundPath).then(method => {
                    console.log('Notification sound played via', method);
                }).catch(err => {
                    console.warn('All playback methods failed:', err);
                });
            }

            if (!localStorage.getItem('sound_slug')) {
                fetch('/api/get-notification-prefs/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken
                    }
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            localStorage.setItem('sound_slug', data.sound_slug);
                            localStorage.setItem('sound_enabled', data.sound_enabled ? 'true' : 'false');
                            if (data.sound_enabled) runPlay(data.sound_slug);
                        }
                    })
                    .catch(e => console.warn("Couldn't fetch sound preferences:", e));
            } else {
                const enabled = localStorage.getItem('sound_enabled') === 'true';
                const slug = localStorage.getItem('sound_slug') || 'chime';
                if (enabled) runPlay(slug);
            }

            // Expose SSE sound player so other scripts can reuse it
            try { window.playNotificationSound = playNotificationSound; } catch (e) { /* ignore */ }
        }

        function startTitleFlash(activeCount) {
            // Coerce and guard: if 0 or invalid, stop flashing
            activeCount = parseInt(String(activeCount), 10) || 0;
            if (activeCount <= 0) {
                stopTitleFlash();
                return;
            }
            // Reset any existing interval before starting
            if (titleFlashInterval) {
                clearInterval(titleFlashInterval);
                titleFlashInterval = null;
            }
            let showActive = true;
            titleFlashInterval = setInterval(() => {
                document.title = showActive ? `(${activeCount}) Active Tickets` : baseTitle;
                showActive = !showActive;
            }, 1000);
        }

        function stopTitleFlash() {
            if (titleFlashInterval) {
                clearInterval(titleFlashInterval);
                titleFlashInterval = null;
            }
            document.title = baseTitle;
        }

        function setupDashboardSSE() {
            let evtSourceDash = new EventSource('/sse/dashboard-status/');
            _activeSSE.push(evtSourceDash);

            evtSourceDash.onopen = function () {
                console.log('Dashboard SSE connection established');
            };

            evtSourceDash.onerror = function () {
                // SSE auto-reconnects; only close and retry if connection is fully closed
                if (evtSourceDash.readyState === EventSource.CLOSED) {
                    console.warn('Dashboard SSE connection closed, reconnecting in 5s...');
                    evtSourceDash.close();
                    setTimeout(setupDashboardSSE, 5000);
                }
            };

            let sseFirstMessage = true; // Skip sound on first SSE message (page load)

            evtSourceDash.onmessage = function (event) {
            try {
                const stats = JSON.parse(event.data);

                // Get active tickets count
                const activeCount = parseInt(String(stats.active_tickets_count || 0), 10) || 0;

                // Get printer errors count
                const printerErrorCount = parseInt(String(stats.printer_errors_count || 0), 10) || 0;

                // Play sound when printer error count increases (on any page)
                if (!sseFirstMessage && previousPrinterErrorCount !== null && printerErrorCount > previousPrinterErrorCount) {
                    console.log("New printer error(s) detected:", printerErrorCount - previousPrinterErrorCount);
                    playNotificationSound();

                    if ("Notification" in window && Notification.permission === "granted") {
                        new Notification("SafePrint — Printer Error", {
                            body: `${printerErrorCount} printer${printerErrorCount > 1 ? 's' : ''} in error state`,
                            icon: "/static/assets/favicon.ico"
                        });
                    }
                }
                previousPrinterErrorCount = printerErrorCount;

                // Update notification bell badge on ALL pages
                const bellBadge = document.getElementById('notification-count');
                if (bellBadge) bellBadge.textContent = String(activeCount);

                // Play sound when ticket count increases (on any page)
                if (previousActiveTicketCount !== null && activeCount > previousActiveTicketCount) {
                    playNotificationSound();
                    if ("Notification" in window && Notification.permission === "granted") {
                        new Notification("SafePrint", {
                            body: `New support ticket — ${activeCount} active ticket${activeCount > 1 ? 's' : ''}`,
                            icon: "/static/assets/favicon.ico"
                        });
                    }
                }
                previousActiveTicketCount = activeCount;

                // Use active tickets for title flashing
                if (activeCount > 0) {
                    startTitleFlash(activeCount);
                } else {
                    stopTitleFlash();
                }

                // Only update dashboard DOM when on dashboard page
                if (window.location.pathname.includes('/portal/dashboard')) {
                    // Update Printer Errors card
                    const printerErrorsElem = document.getElementById('printer-errors-count');
                    if (printerErrorsElem && stats.hasOwnProperty('printer_errors_count')) {
                        printerErrorsElem.textContent = String(stats.printer_errors_count);
                    }
                    // Update Active Tickets
                    const errorElem = document.getElementById('active-tickets-count');
                    if (errorElem && stats.hasOwnProperty('active_tickets_count')) {
                        errorElem.textContent = String(stats.active_tickets_count);
                    }
                    // Update Sales Today
                    const pendingElem = document.getElementById('sales-today-count');
                    if (pendingElem && stats.hasOwnProperty('sales_today_amount')) {
                        pendingElem.textContent = '₱' + Number(stats.sales_today_amount || 0).toFixed(2);
                    }

                    // Update Completed Jobs List (dashboard-right)
                    const completedSection = document.querySelector('.completed-jobs');
                    if (completedSection && Array.isArray(stats.completed_documents)) {
                        const docs = stats.completed_documents;

                        // Ensure title row exists/visibility when there are docs
                        let titleRow = completedSection.querySelector('.completedJobs-item-title');
                        const headerRow = completedSection.querySelector('.dashboard-rows');
                        if (docs.length > 0) {
                            if (!titleRow) {
                                titleRow = document.createElement('div');
                                titleRow.className = 'completedJobs-item-title';
                                titleRow.innerHTML = '<span>Document Name</span><p>Printer Assigned</p>';
                                if (headerRow && headerRow.parentNode) {
                                    headerRow.parentNode.insertBefore(titleRow, headerRow.nextSibling);
                                } else {
                                    completedSection.prepend(titleRow);
                                }
                            } else {
                                titleRow.style.display = '';
                            }
                        } else if (titleRow) {
                            // Hide title when no docs
                            titleRow.style.display = 'none';
                        }

                        // Ensure the container exists
                        let jobsItem = completedSection.querySelector('.jobs-item');
                        if (!jobsItem) {
                            jobsItem = document.createElement('div');
                            jobsItem.className = 'jobs-item';
                            completedSection.appendChild(jobsItem);
                        }

                        // Remove any outer no-jobs placeholders inside the section
                        completedSection.querySelectorAll('.no-jobs').forEach(el => el.remove());

                        // Populate list or show empty state
                        if (docs.length > 0) {
                            jobsItem.innerHTML = '';
                            docs.forEach(doc => {
                                const wrapper = document.createElement('div');
                                wrapper.className = 'jobs-item-wrapper';
                                const printerAssigned = doc.printer_name || doc.printed_at || 'No Printer';
                                wrapper.innerHTML = `
                                    <h6 title="${doc.filename}">${doc.filename}</h6>
                                    <div class="Printer-Assigned">${printerAssigned}</div>
                                    <button class="jobs-done-btn" data-doc-id="${doc.doc_id}">Done</button>
                                `;
                                jobsItem.appendChild(wrapper);
                            });
                        } else {
                            jobsItem.innerHTML = `
                                <div class="no-jobs">
                                    <img src="/static/assets/empty-jobs.png" alt="Completed Jobs">
                                    <p>All Completed!</p>
                                </div>
                            `;
                        }
                    }
                }
                sseFirstMessage = false;
            } catch (e) {
                console.error('Dashboard SSE parse error:', e);
            }
        };
    }

        setupDashboardSSE();
    }

});

// Utility function to update the On Queue empty state
function updateOnQueueEmptyState() {
    const onQueueList = document.querySelector('.on-queue-documents-list');
    let noOnqueueRow = document.getElementById('no-onqueue-documents-row');
    if (onQueueList) {
        const remainingOnQueueRows = onQueueList.querySelectorAll('.on-queue-row[id^="onqueue-doc-"]');
        if (remainingOnQueueRows.length === 0) {
            if (!noOnqueueRow) {
                noOnqueueRow = document.createElement('div');
                noOnqueueRow.className = 'on-queue-row on-queue-empty';
                noOnqueueRow.id = 'no-onqueue-documents-row';
                noOnqueueRow.style.display = 'flex';
                noOnqueueRow.innerHTML = `<div class="queue-empty-text">No documents in queue.</div>`;
                onQueueList.appendChild(noOnqueueRow);
            } else {
                noOnqueueRow.style.display = 'flex';
            }
        } else if (noOnqueueRow) {
            noOnqueueRow.style.display = 'none';
        }
    }
}

// Printer Status Edit Button
let currentEditPrinterId = null;
function openPrinterEditPopup(printerName, printerIP, printerId) {
    document.getElementById('printerEditPopup').style.display = 'flex';
    document.getElementById('editPrinterName').value = printerName || '';
    document.getElementById('editPrinterIP').value = printerIP || '';
    currentEditPrinterId = printerId;
}

function closePrinterEditPopup() {
    document.getElementById('printerEditPopup').style.display = 'none';
    currentEditPrinterId = null;
}

// Printer Delete Function
function showDeletePrinterOverlay(printerId, printerName) {
    document.getElementById('delete-printer-id').value = printerId;
    document.getElementById('delete-printer-name').textContent = printerName;
    showPopupOverlay('deletePrinterOverlay');
}

// Printer Status Add Printer Button modal control
function openAddPrinterPopup() {
    var popup = document.getElementById('addPrinterPopup');
    if (popup) popup.style.display = 'flex';
}

function closeAddPrinterPopup() {
    var popup = document.getElementById('addPrinterPopup');
    if (popup) popup.style.display = 'none';
}

var printerEditForm = document.getElementById('printerEditForm');
if (printerEditForm) {
    printerEditForm.onsubmit = function (e) {
        e.preventDefault();
        var printerName = document.getElementById('editPrinterName').value;
        var printerIP = document.getElementById('editPrinterIP').value;
        var printerId = currentEditPrinterId;
        if (printerName && printerIP && printerId) {
            var data = new FormData();
            data.append('printer_id', printerId);
            data.append('printer_name', printerName);
            data.append('ip_address', printerIP);
            fetch('/api/edit_printer/', {
                method: 'POST',
                headers: { 'X-CSRFToken': csrfToken },
                body: data
            }).then(res => res.json()).then(resp => {
                if (resp.success) {
                    if (typeof createAlert === 'function') {
                        createAlert('Success', 'Printer Updated', 'Printer details updated successfully.', 'success', true, true, 'pageMessages');
                    }
                    window.location.reload();
                } else {
                    if (typeof createAlert === 'function') {
                        createAlert('Error', 'Update Failed', resp.error || 'Failed to update printer.', 'danger', true, true, 'pageMessages');
                    } else {
                        alert(resp.error || 'Failed to update printer');
                    }
                }
            }).catch(() => {
                if (typeof createAlert === 'function') {
                    createAlert('Error', 'Update Failed', 'An error occurred while updating the printer.', 'danger', true, true, 'pageMessages');
                } else {
                    alert('An error occurred while updating the printer.');
                }
            });
        }
        closePrinterEditPopup();
    };
}

// Add event listener for delete printer confirmation button
document.addEventListener('DOMContentLoaded', function () {
    const deletePrinterBtn = document.getElementById('deletePrinterConfirmBtn');
    if (deletePrinterBtn) {
        deletePrinterBtn.addEventListener('click', function () {
            const printerId = document.getElementById('delete-printer-id').value;

            if (!printerId) return;

            fetch('/api/delete_printer/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({ printer_id: printerId })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        createAlert('Success', 'Printer Deleted', 'Printer has been successfully deleted.', 'success', true, true, 'pageMessages');
                        // Reload the page to show updated printer list
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    } else {
                        createAlert('Error', 'Delete Failed', data.error || 'Failed to delete printer.', 'danger', true, true, 'pageMessages');
                    }
                    hidePopupOverlay('deletePrinterOverlay');
                })
                .catch(error => {
                    console.error('Error deleting printer:', error);
                    createAlert('Error', 'Delete Failed', 'An error occurred while deleting the printer.', 'danger', true, true, 'pageMessages');
                    hidePopupOverlay('deletePrinterOverlay');
                });
        });
    }
});

// Printer Status Add Printer Button
var addPrinterForm = document.getElementById('addPrinterForm');
if (addPrinterForm) {
    addPrinterForm.onsubmit = function (e) {
        e.preventDefault();
        var printerName = document.getElementById('addPrinterName').value;
        var printerIP = document.getElementById('addPrinterIP').value;
        if (printerName && printerIP) {
            var data = new FormData();
            data.append('printer_name', printerName);
            data.append('ip_address', printerIP);
            fetch('/api/add_printer/', {
                method: 'POST',
                headers: { 'X-CSRFToken': csrfToken },
                body: data
            }).then(res => res.json()).then(resp => {
                if (resp.success) {
                    if (typeof createAlert === 'function') {
                        createAlert('Success', 'Printer Added', 'Printer added successfully.', 'success', true, true, 'pageMessages');
                    }
                    window.location.reload();
                } else {
                    if (typeof createAlert === 'function') {
                        createAlert('Error', 'Add Failed', resp.error || 'Failed to add printer.', 'danger', true, true, 'pageMessages');
                    } else {
                        alert(resp.error || 'Failed to add printer');
                    }
                }
            }).catch(() => {
                if (typeof createAlert === 'function') {
                    createAlert('Error', 'Add Failed', 'An error occurred while adding the printer.', 'danger', true, true, 'pageMessages');
                } else {
                    alert('An error occurred while adding the printer.');
                }
            });
        }
        closeAddPrinterPopup();
    };
}
// ==================== Real-time Dashboard Ticket Updates ====================
(function() {
    // Only run on dashboard page
    if (!document.getElementById('document-results')) {
        return;
    }

    let lastActiveCount = null;
    let lastResolvedCount = null;

    function formatDashboardCustomerId(customerId) {
        const value = String(customerId || '').trim();
        if (!value) {
            return '—';
        }
        return value.startsWith('#') ? value : `#${value}`;
    }

    function renderActiveTicketRow(ticket) {
        const paymentDisplay = ticket.payment_amount ? `₱${ticket.payment_amount.toFixed(2)}` : '—';
        const customerIdDisplay = ticket.customer_id_display || formatDashboardCustomerId(ticket.customer_id);
        const documentIdsDisplay = ticket.document_ids_display || ticket.doc_id || ticket.document_name || '—';
        const documentMetaDisplay = ticket.document_meta_display || '';
        let actionButtons = `
            <button class="deny-btn" type="button" data-action="void" data-ticket-id="${ticket.id}">Void</button>
            <button class="approve-btn" type="button" data-open-ticket-modal
                data-ticket-id="${ticket.id}"
                data-ticket-number="${ticket.ticket_number}"
                data-customer-id="${ticket.customer_id}"
                data-customer-name="${ticket.customer_name}"
                data-email="${ticket.email}"
                data-phone="${ticket.phone_number}"
                data-doc-id="${ticket.doc_id || ''}"
                data-doc-name="${ticket.document_name}"
                data-issue="${ticket.description.replace(/"/g, '&quot;')}"
                data-problem-type="${ticket.problem_type}"
                data-was-reprinted="${ticket.was_reprinted}"
                data-gcash-number="${ticket.gcash_number || ''}"
                data-payment-amount="${ticket.payment_amount || ''}"
                data-refund-status="${ticket.refund_status || 'none'}"
                data-refund-amount="${ticket.refund_amount || ''}"
                data-receipt-code="${ticket.receipt_code || ''}"
                data-receipt-screenshot-url="${ticket.receipt_screenshot_url || ''}">Verify</button>
            <button class="refund-btn" type="button" data-action="refund" data-ticket-id="${ticket.id}">Refund</button>
        `;

        return `
            <div class="document-item" data-ticket-number="${ticket.ticket_number}" data-ticket-id="${ticket.id}">
                <div class="ticket-cell">
                    <img src="/static/assets/ticket-icon.png" alt="Ticket" class="ticket-icon">
                    <div class="ticket-meta">
                        <h6>${ticket.ticket_number}</h6>
                        <span>${paymentDisplay}</span>
                    </div>
                </div>
                <div class="ticket-customer">${customerIdDisplay}</div>
                <div class="ticket-date">${ticket.created_at}</div>
                <div class="ticket-documents">
                    <span>${documentIdsDisplay}</span>
                    ${documentMetaDisplay ? `<span>${documentMetaDisplay}</span>` : ''}
                </div>
                <div class="actions">
                    ${actionButtons}
                </div>
            </div>
        `;
    }

    function renderResolvedTicketRow(ticket) {
        const paymentDisplay = ticket.payment_amount ? `₱${ticket.payment_amount.toFixed(2)}` : '—';
        return `
            <div class="document-item resolved-row">
                <div class="ticket-cell">
                    <img src="/static/assets/ticket-icon.png" alt="Ticket" class="ticket-icon">
                    <div class="ticket-meta">
                        <h6>${ticket.ticket_number}</h6>
                        <span>${paymentDisplay}</span>
                    </div>
                </div>
                <div class="resolved-customer">${ticket.customer_name}</div>
                <div class="resolved-email">${ticket.email}</div>
                <div class="resolved-verifier">${ticket.resolved_by || '—'}</div>
                <div class="resolved-status">${ticket.status}</div>
                <div class="resolved-details">
                    <button class="approve-btn view-details-btn" type="button" data-open-ticket-modal
                        data-ticket-id="${ticket.id}"
                        data-ticket-number="${ticket.ticket_number}"
                        data-customer-id="${ticket.customer_id}"
                        data-customer-name="${ticket.customer_name}"
                        data-email="${ticket.email}"
                        data-phone="${ticket.phone_number}"
                        data-doc-id="${ticket.doc_id || ''}"
                        data-doc-name="${ticket.document_name}"
                        data-issue="${ticket.description.replace(/"/g, '&quot;')}"
                        data-problem-type="${ticket.problem_type}"
                        data-was-reprinted="${ticket.was_reprinted}"
                        data-gcash-number="${ticket.gcash_number || ''}"
                        data-payment-amount="${ticket.payment_amount || ''}"
                        data-refund-status="${ticket.refund_status || 'none'}"
                        data-refund-amount="${ticket.refund_amount || ''}"
                        data-receipt-code="${ticket.receipt_code || ''}"
                        data-receipt-screenshot-url="${ticket.receipt_screenshot_url || ''}">View Details</button>
                </div>
            </div>
        `;
    }

    function updateActiveTickets(tickets) {
        // Merge new tickets into the current DOM instead of replacing all HTML.
        const container = document.getElementById('document-results');
        if (!container) return;

        console.log('[tickets] updateActiveTickets called —', tickets.length, 'tickets');

        // Ensure the header/search exists (don't stomp other scripts)
        let header = container.querySelector('.list-header');
        if (!header) {
            header = document.createElement('div');
            header.className = 'list-header';
            header.innerHTML = `
                <div class="search-bar">
                    <input type="text" id="dashboard-search" placeholder="Search by Ticket Number">
                    <span class="search-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="#18191F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M20.9999 21L16.6499 16.65" stroke="#18191F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                </div>
                <div class="document-item-title active-header">
                    <div class="ticket-header-cell">
                        <span class="ticket-header-spacer" aria-hidden="true"></span>
                        <span>Ticket Number</span>
                    </div>
                    <p>Customer ID</p>
                    <p>Date Submitted</p>
                    <p>Document ID</p>
                    <span class="action-title"></span>
                </div>
            `;
            // Insert header at top
            container.insertAdjacentElement('afterbegin', header);
        }

        // Build a set of incoming ticket IDs
        const incomingIds = new Set(tickets.map(t => String(t.id)));

        // Remove DOM items that are no longer active
        Array.from(container.querySelectorAll('.document-item[data-ticket-id]')).forEach(el => {
            const id = el.getAttribute('data-ticket-id');
            if (!incomingIds.has(id)) {
                el.remove();
            }
        });

        // For each incoming ticket, append if not present
        tickets.forEach(ticket => {
            const exists = container.querySelector('.document-item[data-ticket-id="' + ticket.id + '"]');
            if (!exists) {
                console.log('[tickets] adding ticket', ticket.id, ticket.ticket_number);
                // Insert new ticket right after the header
                const temp = document.createElement('div');
                temp.innerHTML = renderActiveTicketRow(ticket);
                const node = temp.firstElementChild;
                if (header.nextSibling) {
                    container.insertBefore(node, header.nextSibling);
                } else {
                    container.appendChild(node);
                }
            } else {
                // existing
                // console.log('[tickets] already present', ticket.id);
            }
        });

        // If there are no tickets, ensure an empty-row message exists
        if (tickets.length === 0) {
            if (!container.querySelector('.empty-row')) {
                const empty = document.createElement('div');
                empty.className = 'document-item empty-row';
                empty.innerHTML = `<p style="margin:0; font-family: 'Montserrat', sans-serif;">No active tickets.</p>`;
                container.appendChild(empty);
            }
        } else {
            // Remove any empty-row placeholder
            Array.from(container.querySelectorAll('.empty-row')).forEach(el => el.remove());
        }

        attachTicketEventListeners();
    }

    function updateResolvedTickets(tickets) {
        const container = document.querySelector('.resolved-list-container .document-results');
        if (!container) return;

        if (tickets.length === 0) {
            container.innerHTML = `
                <div class="list-header">
                    <div class="search-bar">
                        <input type="text" placeholder="Search by Ticket Number">
                        <span class="search-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="#18191F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M20.9999 21L16.6499 16.65" stroke="#18191F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                    </div>
                    <div class="document-item-title resolved-header">
                        <span>Ticket Number</span>
                        <p>Customer Name</p>
                        <p>Email</p>
                        <p>Verified by</p>
                        <p>Status</p>
                        <p></p>
                    </div>
                </div>
                <div class="document-item empty-row">
                    <p style="margin:0; font-family: 'Montserrat', sans-serif;">No resolved tickets.</p>
                </div>
            `;
        } else {
            let html = `
                <div class="list-header">
                    <div class="search-bar">
                        <input type="text" placeholder="Search by Ticket Number">
                        <span class="search-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="#18191F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M20.9999 21L16.6499 16.65" stroke="#18191F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                    </div>
                    <div class="document-item-title resolved-header">
                        <span>Ticket Number</span>
                        <p>Customer Name</p>
                        <p>Email</p>
                        <p>Verified by</p>
                        <p>Status</p>
                        <p></p>
                    </div>
                </div>
            `;
            tickets.forEach(ticket => {
                html += renderResolvedTicketRow(ticket);
            });
            container.innerHTML = html;
        }

        attachTicketEventListeners();
    }

    function attachTicketEventListeners() {
        // Re-attach modal opener listeners to dynamically added elements
        document.querySelectorAll('[data-open-ticket-modal]').forEach(button => {
            button.onclick = function(e) {
                e.preventDefault();
                const ticketId = this.getAttribute('data-ticket-id');
                const ticketNumber = this.getAttribute('data-ticket-number');
                const customerId = this.getAttribute('data-customer-id');
                const customerName = this.getAttribute('data-customer-name');
                const email = this.getAttribute('data-email');
                const phone = this.getAttribute('data-phone');
                const docId = this.getAttribute('data-doc-id');
                const docName = this.getAttribute('data-doc-name');
                const issue = this.getAttribute('data-issue');
                const problemType = this.getAttribute('data-problem-type');
                const wasReprinted = this.getAttribute('data-was-reprinted');

                document.getElementById('modal-customer-id').textContent = customerId;
                document.getElementById('modal-doc-id').textContent = docId;
                document.getElementById('modal-customer-name').textContent = customerName;
                document.getElementById('modal-doc-name').textContent = docName;
                document.getElementById('modal-email').textContent = email;
                document.getElementById('modal-problem-type').textContent = problemType;
                document.getElementById('modal-phone').textContent = phone;
                document.getElementById('modal-reprinted').textContent = (wasReprinted === 'True' || wasReprinted === 'true') ? 'Yes' : 'No';
                document.getElementById('modal-issue').textContent = issue;
                document.getElementById('ticket-modal-title').textContent = ticketNumber || 'Ticket Details';

                // GCash and payment amount
                var gcashEl = document.getElementById('modal-gcash');
                if (gcashEl) gcashEl.textContent = this.getAttribute('data-gcash-number') || '—';
                var payAmountEl = document.getElementById('modal-payment-amount');
                if (payAmountEl) {
                    var amt = this.getAttribute('data-payment-amount');
                    payAmountEl.textContent = amt ? '₱' + parseFloat(amt).toFixed(2) : '—';
                }

                // Refund section
                var refundSection = document.getElementById('modal-refund-section');
                var refundStatus = this.getAttribute('data-refund-status') || 'none';
                if (refundSection) {
                    if (refundStatus === 'pending') {
                        refundSection.style.display = 'block';
                        var refAmtEl = document.getElementById('modal-refund-amount');
                        var refGcashEl = document.getElementById('modal-refund-gcash');
                        if (refAmtEl) {
                            var refAmt = this.getAttribute('data-refund-amount');
                            refAmtEl.textContent = refAmt ? '₱' + parseFloat(refAmt).toFixed(2) : '—';
                        }
                        if (refGcashEl) refGcashEl.textContent = this.getAttribute('data-gcash-number') || '—';
                        var refInput = document.getElementById('modal-refund-ref');
                        if (refInput) refInput.value = '';
                        var completeBtn = document.getElementById('modal-complete-refund-btn');
                        if (completeBtn) {
                            completeBtn.onclick = function() {
                                var ref = document.getElementById('modal-refund-ref').value.trim();
                                if (!ref) { alert('Please enter the GCash reference number.'); return; }
                                fetch('/portal/api/complete-refund/', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                                    body: JSON.stringify({ ticket_id: ticketId, refund_reference: ref })
                                })
                                .then(function(r) { return r.json(); })
                                .then(function(data) {
                                    if (data.success) {
                                        createAlert('Success', 'Refund Completed', 'Refund marked as completed. Ref: ' + ref, 'success', true, true, 'pageMessages');
                                        refundSection.style.display = 'none';
                                        if (typeof refreshTickets === 'function') refreshTickets();
                                        fetchAuditLog(ticketId);
                                    } else {
                                        createAlert('Error', 'Complete Failed', data.error || 'Failed to complete refund.', 'danger', true, true, 'pageMessages');
                                    }
                                });
                            };
                        }
                    } else {
                        refundSection.style.display = 'none';
                    }
                }

                // Receipt proof section
                var receiptCodeEl = document.getElementById('modal-receipt-code');
                var receiptImgContainer = document.getElementById('modal-receipt-image-container');
                var receiptNone = document.getElementById('modal-receipt-none');
                var receiptImg = document.getElementById('modal-receipt-img');
                var receiptBtn = document.getElementById('modal-receipt-btn');
                var receiptCode = this.getAttribute('data-receipt-code') || '';
                var receiptUrl = this.getAttribute('data-receipt-screenshot-url') || '';
                if (receiptCodeEl) receiptCodeEl.textContent = receiptCode || '—';
                if (receiptUrl) {
                    if (receiptImg) receiptImg.src = receiptUrl;
                    if (receiptImgContainer) receiptImgContainer.style.display = 'block';
                    if (receiptNone) receiptNone.style.display = 'none';
                    if (receiptBtn) {
                        receiptBtn.onclick = function() {
                            var overlay = document.getElementById('receipt-image-overlay');
                            var overlayImg = document.getElementById('receipt-overlay-img');
                            if (overlay && overlayImg) {
                                overlayImg.src = receiptUrl;
                                overlay.style.display = 'flex';
                                overlay.setAttribute('aria-hidden', 'false');
                            }
                        };
                    }
                } else {
                    if (receiptImgContainer) receiptImgContainer.style.display = 'none';
                    if (receiptNone) receiptNone.style.display = 'block';
                }

                // Store ticket ID for audit log button
                window._currentTicketId = ticketId;

                const modal = document.getElementById('ticket-modal');
                modal.classList.add('is-open');
                modal.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
            };
        });

        // Re-attach action listeners
        document.querySelectorAll('[data-action="void"]').forEach(button => {
            button.onclick = handleVoidTicket;
        });

        document.querySelectorAll('[data-action="refund"]').forEach(button => {
            button.onclick = handleRefundTicket;
        });

        // Re-attach modal close listeners
        document.querySelectorAll('[data-close-ticket-modal]').forEach(el => {
            el.onclick = function() {
                const modal = document.getElementById('ticket-modal');
                modal.classList.remove('is-open');
                modal.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
            };
        });
    }

    function handleVoidTicket(e) {
        e.preventDefault();
        const ticketId = this.getAttribute('data-ticket-id');
        if (confirm('Are you sure you want to void this ticket?')) {
            fetch('/api/void-ticket/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({ ticket_id: ticketId })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    createAlert('Success', 'Ticket Voided', 'The ticket has been successfully voided.', 'success', true, true, 'pageMessages');
                    refreshTickets();
                } else {
                    createAlert('Error', 'Void Failed', data.error || 'Failed to void the ticket.', 'danger', true, true, 'pageMessages');
                }
            })
            .catch(error => {
                console.error('Error voiding ticket:', error);
                createAlert('Error', 'Void Failed', 'An error occurred while voiding the ticket.', 'danger', true, true, 'pageMessages');
            });
        }
    }

    function handleRefundTicket(e) {
        e.preventDefault();
        const ticketId = this.getAttribute('data-ticket-id');
        // Find the Verify button in the same row to get GCash info
        const row = this.closest('.document-item');
        let gcashInfo = '';
        if (row) {
            const verifyBtn = row.querySelector('[data-open-ticket-modal]');
            if (verifyBtn) {
                const gcash = verifyBtn.getAttribute('data-gcash-number');
                if (gcash) gcashInfo = '\nGCash Number: ' + gcash;
            }
        }
        if (confirm('Are you sure you want to refund this ticket?' + gcashInfo)) {
            fetch('/api/refund-ticket/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({ ticket_id: ticketId })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    createAlert('Success', 'Ticket Refunded', 'The ticket has been successfully refunded.', 'success', true, true, 'pageMessages');
                    refreshTickets();
                } else {
                    createAlert('Error', 'Refund Failed', data.error || 'Failed to refund the ticket.', 'danger', true, true, 'pageMessages');
                }
            })
            .catch(error => {
                console.error('Error refunding ticket:', error);
                createAlert('Error', 'Refund Failed', 'An error occurred while refunding the ticket.', 'danger', true, true, 'pageMessages');
            });
        }
    }

    function refreshTickets() {
        console.log('[tickets] refreshTickets -> fetching /portal/api/get-active-tickets/');
        fetch('/portal/api/get-active-tickets/')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const activeCount = data.active_count || 0;
                    const salesTodayAmount = Number(data.sales_today_amount || 0);

                    // Update counts in stat cards
                    document.getElementById('active-tickets-count').textContent = activeCount;
                    document.getElementById('sales-today-count').textContent = '₱' + salesTodayAmount.toFixed(2);

                    // Update notification bell badge if present
                    const notifCountEl = document.getElementById('notification-count');
                    if (notifCountEl) notifCountEl.textContent = activeCount;

                    // Populate notification panel with a compact list
                    const panelList = document.getElementById('notification-panel-list');
                    if (panelList) {
                        panelList.innerHTML = '';
                        if (Array.isArray(data.active_tickets) && data.active_tickets.length > 0) {
                            data.active_tickets.slice(0, 20).forEach(t => {
                                const item = document.createElement('div');
                                item.className = 'notif-item';
                                item.style.padding = '6px 4px';
                                item.style.borderBottom = '1px solid #f1f1f1';
                                item.innerHTML = `<div style="font-weight:600">${t.ticket_number}</div><div style="font-size:0.9rem;color:#666">${t.problem_type} • ${t.created_at}</div>`;
                                item.addEventListener('click', function() {
                                    // Open ticket modal using the same attributes
                                    document.getElementById('modal-customer-id').textContent = t.customer_id || '';
                                    document.getElementById('modal-doc-id').textContent = t.doc_id || '';
                                    document.getElementById('modal-customer-name').textContent = t.customer_name || '';
                                    document.getElementById('modal-doc-name').textContent = t.document_name || '';
                                    document.getElementById('modal-email').textContent = t.email || '';
                                    document.getElementById('modal-problem-type').textContent = t.problem_type || '';
                                    document.getElementById('modal-phone').textContent = t.phone_number || '';
                                    document.getElementById('modal-reprinted').textContent = t.was_reprinted ? 'Yes' : 'No';
                                    document.getElementById('modal-issue').textContent = t.description || '';
                                    document.getElementById('ticket-modal-title').textContent = t.ticket_number || 'Ticket Details';
                                    const modal = document.getElementById('ticket-modal');
                                    modal.classList.add('is-open');
                                    modal.setAttribute('aria-hidden', 'false');
                                    document.body.style.overflow = 'hidden';
                                    // Hide panel
                                    const panel = document.getElementById('notification-panel');
                                    if (panel) panel.style.display = 'none';
                                });
                                panelList.appendChild(item);
                            });
                        } else {
                            panelList.innerHTML = '<div style="padding:8px;color:#666;font-family:Montserrat,sans-serif">No active tickets</div>';
                        }
                    }

                    // Update ticket lists
                    updateActiveTickets(data.active_tickets);
                    updateResolvedTickets(data.resolved_tickets);

                    // Play notification sound only when ticket count INCREASES
                    // (skip initial load — don't play just because there are existing tickets)
                    if (lastActiveCount !== null && activeCount > lastActiveCount) {
                        playNotificationSound();
                    }

                    lastActiveCount = activeCount;
                    lastResolvedCount = resolvedCount;
                }
            })
            .catch(error => console.error('Error refreshing tickets:', error));
    }
    window.refreshTickets = refreshTickets;

    function playNotificationSound() {
        // Prefer existing global playNotificationSound (SSE block) if available
        try {
            if (typeof window.playNotificationSound === 'function') {
                const p = window.playNotificationSound();
                if (p && typeof p.then === 'function') {
                    p.catch(err => console.warn('Global playNotificationSound() failed:', err));
                }
                return;
            }
        } catch (e) {
            console.log('Error calling global playNotificationSound():', e);
        }

        // Reuse a single Audio element to ensure repeated plays work
        try {
            window._sp_fallback_audio = window._sp_fallback_audio || new Audio();
            const audio = window._sp_fallback_audio;
            const soundSlug = localStorage.getItem('sound_slug') || 'chime';
            const soundPath = `/static/sounds/${soundSlug}.mp3`;
            // If src differs, set it
            if (audio.src.indexOf(soundPath) === -1) audio.src = soundPath;
            audio.volume = 1.0;
            // Reset playback position
            try { audio.currentTime = 0; } catch (e) { /* ignore */ }
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    console.warn('Fallback audio.play() failed:', err);
                    // Try WebAudio fallback
                    try {
                        const AudioContext = window.AudioContext || window.webkitAudioContext;
                        if (!AudioContext) throw new Error('WebAudio not supported');
                        const ctx = window._sp_audio_ctx || new AudioContext();
                        window._sp_audio_ctx = ctx;
                        Promise.resolve(ctx.state === 'suspended' ? ctx.resume() : ctx)
                            .then(() => fetch(soundPath))
                            .then(res => res.arrayBuffer())
                            .then(buf => ctx.decodeAudioData(buf))
                            .then(decoded => {
                                const src = ctx.createBufferSource();
                                src.buffer = decoded;
                                src.connect(ctx.destination);
                                try { src.start(0); } catch (e) { console.warn('WebAudio start failed:', e); }
                            })
                            .catch(webErr => console.warn('WebAudio fallback failed:', webErr));
                    } catch (we) {
                        console.warn('WebAudio fallback unavailable:', we);
                    }
                });
            }
        } catch (error) {
            console.log('Could not play notification sound (fallback):', error);
        }
    }
    // Note: removed explicit enable-sound button. Browsers may still block
    // autoplay; if so, playback requires a user gesture in that browser.

    // Initial fetch and setup polling
    refreshTickets();
    setInterval(refreshTickets, 5000); // Poll every 5 seconds
})();

// Notification bell interactions — works on all admin pages
(function(){
    const bell = document.getElementById('notification-bell');
    if (!bell) return;

    // Create notification dropdown panel dynamically
    const bellParent = bell.closest('div[style*="position:relative"]') || bell.parentElement;
    let panel = document.getElementById('notification-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'notification-panel';
        panel.style.cssText = 'display:none; position:absolute; top:100%; right:0; width:320px; max-height:400px; overflow-y:auto; background:#fff; border:2px solid #18191F; border-radius:12px; box-shadow:0 4px 16px rgba(0,0,0,0.15); z-index:2000; font-family:Montserrat,sans-serif;';
        panel.innerHTML = '<div id="notification-panel-list" style="padding:8px;"><div style="padding:8px;color:#666;">Loading...</div></div>';
        bellParent.appendChild(panel);
    }
    const panelList = document.getElementById('notification-panel-list');

    function fetchAndPopulatePanel() {
        if (!panelList) return;
        panelList.innerHTML = '<div style="padding:8px;color:#666;">Loading...</div>';
        fetch('/portal/api/get-active-tickets/')
            .then(function(res) { return res.json(); })
            .then(function(data) {
                panelList.innerHTML = '';
                if (data.success && Array.isArray(data.active_tickets) && data.active_tickets.length > 0) {
                    data.active_tickets.slice(0, 20).forEach(function(t) {
                        var item = document.createElement('div');
                        item.className = 'notif-item';
                        item.style.cssText = 'padding:8px; border-bottom:1px solid #f1f1f1; cursor:pointer;';
                        item.innerHTML = '<div style="font-weight:600">' + (t.ticket_number || '') + '</div><div style="font-size:0.85rem;color:#666">' + (t.problem_type || '') + ' &bull; ' + (t.created_at || '') + '</div>';
                        item.addEventListener('click', function() {
                            // Try to open detailed ticket modal if on dashboard
                            var modal = document.getElementById('ticket-modal');
                            if (modal) {
                                document.getElementById('modal-customer-id').textContent = t.customer_id || '';
                                document.getElementById('modal-doc-id').textContent = t.doc_id || '';
                                document.getElementById('modal-customer-name').textContent = t.customer_name || '';
                                document.getElementById('modal-doc-name').textContent = t.document_name || '';
                                document.getElementById('modal-email').textContent = t.email || '';
                                document.getElementById('modal-problem-type').textContent = t.problem_type || '';
                                document.getElementById('modal-phone').textContent = t.phone_number || '';
                                document.getElementById('modal-reprinted').textContent = t.was_reprinted ? 'Yes' : 'No';
                                document.getElementById('modal-issue').textContent = t.description || '';
                                document.getElementById('ticket-modal-title').textContent = t.ticket_number || 'Ticket Details';
                                modal.classList.add('is-open');
                                modal.setAttribute('aria-hidden', 'false');
                                document.body.style.overflow = 'hidden';
                            } else {
                                // Redirect to dashboard if not on dashboard
                                window.location.href = '/portal/dashboard/';
                            }
                            panel.style.display = 'none';
                        });
                        panelList.appendChild(item);
                    });
                } else {
                    panelList.innerHTML = '<div style="padding:8px;color:#666;">No active tickets</div>';
                }
            })
            .catch(function() {
                panelList.innerHTML = '<div style="padding:8px;color:#d9534f;">Failed to load tickets</div>';
            });
    }

    bell.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var isOpen = panel.style.display === 'block';
        panel.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) fetchAndPopulatePanel();
    });

    // Close panel when clicking outside
    document.addEventListener('click', function(e) {
        if (!bell.contains(e.target) && !panel.contains(e.target)) {
            panel.style.display = 'none';
        }
    });
})();

// Live logs drawer — admin-only log tail viewer attached beside the notification bell
(function () {
    const drawer = document.getElementById('live-logs-drawer');
    const backdrop = document.getElementById('live-logs-backdrop');
    const statusText = document.getElementById('live-logs-status');
    const sourceSelect = document.getElementById('live-logs-source-select');
    const content = document.getElementById('live-logs-content');
    const closeBtn = document.getElementById('live-logs-close');
    const refreshBtn = document.getElementById('live-logs-refresh');
    const pauseBtn = document.getElementById('live-logs-pause');
    const lineCountSelect = document.getElementById('live-logs-line-count');
    const bell = document.getElementById('notification-bell');
    const terminalIconPath = document.body.dataset.terminalIcon || '/static/assets/terminal.svg';

    if (!drawer || !backdrop || !statusText || !sourceSelect || !content || !closeBtn || !refreshBtn || !pauseBtn || !lineCountSelect || !bell) {
        return;
    }

    let selectedSource = 'gunicorn_error';
    let isOpen = false;
    let isPaused = false;
    let refreshTimer = null;

    const bellContainer = bell.closest('div[style*="position:relative"]') || bell.parentElement;
    if (bellContainer) {
        bellContainer.style.display = 'inline-flex';
        bellContainer.style.alignItems = 'center';
        bellContainer.style.gap = '10px';
    }

    const logsButton = document.createElement('button');
    logsButton.type = 'button';
    logsButton.id = 'live-logs-toggle';
    logsButton.className = 'live-logs-toggle';
    logsButton.setAttribute('aria-label', 'Hide or show live terminal logs');
    logsButton.innerHTML = '<img src="' + terminalIconPath + '" alt="" class="live-logs-toggle-icon" aria-hidden="true">';
    logsButton.title = 'Terminal logs';
    if (bellContainer) {
        bellContainer.appendChild(logsButton);
    }

    function setDrawerOpen(nextOpen) {
        isOpen = nextOpen;
        drawer.classList.toggle('is-open', nextOpen);
        drawer.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
        backdrop.hidden = !nextOpen;
        logsButton.classList.toggle('is-active', nextOpen);

        if (!nextOpen) {
            window.clearInterval(refreshTimer);
            refreshTimer = null;
            return;
        }

        loadLogs();
        refreshTimer = window.setInterval(function () {
            if (!isPaused) {
                loadLogs();
            }
        }, 3000);
    }

    function renderSources(sources) {
        if (!Array.isArray(sources) || !sources.length) {
            return;
        }

        sourceSelect.innerHTML = '';
        sources.forEach(function (source) {
            const option = document.createElement('option');
            option.value = source.id;
            option.textContent = source.label;
            sourceSelect.appendChild(option);
        });
        sourceSelect.value = selectedSource;
    }

    function updateToolbarState() {
        pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
        pauseBtn.setAttribute('aria-pressed', isPaused ? 'true' : 'false');
    }

    function formatUpdatedAt(updatedAt) {
        if (!updatedAt) {
            return 'idle';
        }

        const date = new Date(updatedAt * 1000);
        if (Number.isNaN(date.getTime())) {
            return 'Updated just now';
        }

        return 'last sync ' + date.toLocaleTimeString();
    }

    function loadLogs() {
        const params = new URLSearchParams({
            source: selectedSource,
            lines: String(lineCountSelect.value || 120)
        });

        statusText.textContent = '$ tail -f ' + selectedSource.replace(/_/g, '-');

        fetch('/portal/api/live-logs/?' + params.toString(), {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
            .then(function (response) {
                return response.json().then(function (data) {
                    if (!response.ok || !data.success) {
                        throw new Error(data.error || 'Failed to load logs.');
                    }
                    return data;
                });
            })
            .then(function (data) {
                selectedSource = data.selected_source || selectedSource;
                renderSources(data.sources);

                if (data.unavailable_reason) {
                    content.textContent = '[unavailable] ' + data.unavailable_reason;
                    statusText.textContent = '[unavailable]';
                    return;
                }

                content.textContent = data.content || '$ no log lines available yet';
                content.scrollTop = content.scrollHeight;
                statusText.textContent = formatUpdatedAt(data.updated_at);
            })
            .catch(function (error) {
                content.textContent = '[error] Unable to load logs.';
                statusText.textContent = error.message || '[error]';
            });
    }

    logsButton.addEventListener('click', function () {
        setDrawerOpen(!isOpen);
    });

    closeBtn.addEventListener('click', function () {
        setDrawerOpen(false);
    });

    backdrop.addEventListener('click', function () {
        setDrawerOpen(false);
    });

    refreshBtn.addEventListener('click', function () {
        loadLogs();
    });

    pauseBtn.addEventListener('click', function () {
        isPaused = !isPaused;
        updateToolbarState();
        if (!isPaused) {
            loadLogs();
        }
    });

    lineCountSelect.addEventListener('change', function () {
        loadLogs();
    });

    sourceSelect.addEventListener('change', function () {
        selectedSource = sourceSelect.value || selectedSource;
        loadLogs();
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && isOpen) {
            setDrawerOpen(false);
        }
    });

    updateToolbarState();
})();

// Paper Refill - Tray Capacity editing and Mark as Refilled
(function() {
    // Time ago helper function
    function timeAgo(date) {
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 5) return 'Just now';
        if (seconds < 60) return seconds + ' seconds ago';
        
        const minutes = Math.floor(seconds / 60);
        if (minutes === 1) return '1 minute ago';
        if (minutes < 60) return minutes + ' minutes ago';
        
        const hours = Math.floor(minutes / 60);
        if (hours === 1) return '1 hour ago';
        if (hours < 24) return hours + ' hours ago';
        
        const days = Math.floor(hours / 24);
        if (days === 1) return 'Yesterday';
        if (days < 7) return days + ' days ago';
        
        const weeks = Math.floor(days / 7);
        if (weeks === 1) return '1 week ago';
        if (weeks < 4) return weeks + ' weeks ago';
        
        const months = Math.floor(days / 30);
        if (months === 1) return '1 month ago';
        return months + ' months ago';
    }

    // Update all refill times on the page
    function updateRefillTimes() {
        document.querySelectorAll('.refill-time[data-timestamp]').forEach(el => {
            const timestamp = el.dataset.timestamp;
            if (timestamp && timestamp !== 'None' && timestamp !== '') {
                const date = new Date(timestamp);
                if (!isNaN(date.getTime())) {
                    el.textContent = timeAgo(date);
                }
            }
        });
    }

    // Click on tray capacity to edit
    document.querySelectorAll('.tray-capacity-display').forEach(display => {
        display.style.cursor = 'pointer';
        display.addEventListener('click', function() {
            const printerId = this.dataset.printerId;
            const input = document.querySelector(`.tray-capacity-input[data-printer-id="${printerId}"]`);
            if (input) {
                this.style.display = 'none';
                input.style.display = 'inline-block';
                input.focus();
                input.select();
            }
        });
    });

    // Edit button click to trigger tray capacity edit
    document.querySelectorAll('.tray-edit-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const printerId = this.dataset.printerId;
            const display = document.querySelector(`.tray-capacity-display[data-printer-id="${printerId}"]`);
            const input = document.querySelector(`.tray-capacity-input[data-printer-id="${printerId}"]`);
            if (display && input) {
                display.style.display = 'none';
                this.style.display = 'none';
                input.style.display = 'inline-block';
                input.focus();
                input.select();
            }
        });
    });

    // Handle tray capacity input
    document.querySelectorAll('.tray-capacity-input').forEach(input => {
        const saveCapacity = function() {
            const printerId = input.dataset.printerId;
            const display = document.querySelector(`.tray-capacity-display[data-printer-id="${printerId}"]`);
            const editBtn = document.querySelector(`.tray-edit-btn[data-printer-id="${printerId}"]`);
            const value = parseInt(input.value, 10);
            
            if (isNaN(value) || value <= 0) {
                input.value = parseInt(display.textContent, 10);
                input.style.display = 'none';
                display.style.display = 'inline';
                if (editBtn) editBtn.style.display = '';
                return;
            }

            fetch('/portal/api/update_printer_field/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-CSRFToken': csrfToken
                },
                body: `printer_id=${printerId}&field=tray_capacity&value=${value}`
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    display.textContent = value + ' sheets';
                }
                input.style.display = 'none';
                display.style.display = 'inline';
                if (editBtn) editBtn.style.display = '';
            })
            .catch(err => {
                console.error('Error updating tray capacity:', err);
                input.style.display = 'none';
                display.style.display = 'inline';
                if (editBtn) editBtn.style.display = '';
            });
        };

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveCapacity();
            } else if (e.key === 'Escape') {
                const printerId = input.dataset.printerId;
                const display = document.querySelector(`.tray-capacity-display[data-printer-id="${printerId}"]`);
                const editBtn = document.querySelector(`.tray-edit-btn[data-printer-id="${printerId}"]`);
                input.value = parseInt(display.textContent, 10);
                input.style.display = 'none';
                display.style.display = 'inline';
                if (editBtn) editBtn.style.display = '';
            }
        });

        input.addEventListener('blur', saveCapacity);
    });

    // Mark as Refilled button
    document.querySelectorAll('.refill-btn[data-printer-id]').forEach(btn => {
        btn.addEventListener('click', function() {
            const printerId = this.dataset.printerId;
            const row = this.closest('.printer-table-row');
            
            fetch('/portal/api/mark_printer_refilled/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-CSRFToken': csrfToken
                },
                body: `printer_id=${printerId}`
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    // Update tray level display
                    const trayLevelCell = row.querySelector('.status-dot');
                    if (trayLevelCell) {
                        trayLevelCell.className = 'status-dot ok';
                        trayLevelCell.parentElement.innerHTML = '<span class="status-dot ok"></span> Full';
                    }
                    
                    // Update remaining count
                    const remainingCell = row.querySelector('.tray-remaining-cell');
                    if (remainingCell && data.tray_current_count != null) {
                        remainingCell.textContent = data.tray_current_count + ' sheets';
                    }
                    
                    // Update refill time
                    const refillTimeCell = row.querySelector('.refill-time');
                    if (refillTimeCell) {
                        refillTimeCell.dataset.timestamp = data.last_refill_time;
                        refillTimeCell.textContent = 'Just now';
                    }
                }
            })
            .catch(err => {
                console.error('Error marking printer as refilled:', err);
            });
        });
    });

    // Update refill times initially and every minute
    updateRefillTimes();
    setInterval(updateRefillTimes, 60000);
})();

// Voucher Management
(function() {
    if (!window.location.pathname.includes('/portal/vouchers')) return;

    const generateBtn = document.getElementById('generate-voucher-btn');
    const amountInput = document.getElementById('voucher-amount');
    const resultDiv = document.getElementById('voucher-generate-result');
    const searchInput = document.getElementById('voucher-search');
    const statusFilter = document.getElementById('voucher-status-filter');

    // Generate voucher
    if (generateBtn) {
        generateBtn.addEventListener('click', function() {
            const amount = parseFloat(amountInput.value);
            if (!amount || amount <= 0) {
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '<span style="color: #F33700;">Please enter a valid amount.</span>';
                return;
            }

            generateBtn.disabled = true;
            generateBtn.textContent = 'Generating...';

            fetch('/portal/api/generate-voucher/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({ amount: amount })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const v = data.voucher;
                    resultDiv.style.display = 'block';
                    resultDiv.innerHTML = `
                        <span style="color: #18191F;">Generated: </span>
                        <span class="voucher-generated-code">${v.code}</span>
                        <span style="margin-left: 12px;">₱${v.original_amount.toFixed(2)} — expires ${v.expires_at}</span>
                    `;
                    amountInput.value = '';
                    // Reload voucher list
                    loadVouchers();
                } else {
                    resultDiv.style.display = 'block';
                    resultDiv.innerHTML = `<span style="color: #F33700;">${data.error}</span>`;
                }
            })
            .catch(err => {
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '<span style="color: #F33700;">Error generating voucher.</span>';
            })
            .finally(() => {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Voucher';
            });
        });
    }

    // Load vouchers via API
    function loadVouchers() {
        const search = searchInput ? searchInput.value.trim() : '';
        const status = statusFilter ? statusFilter.value : 'all';
        const params = new URLSearchParams({ search, status });

        fetch(`/portal/api/vouchers/?${params}`)
            .then(res => res.json())
            .then(data => {
                if (!data.success) return;
                const tbody = document.getElementById('voucher-table-body');
                if (!tbody) return;

                if (data.vouchers.length === 0) {
                    tbody.innerHTML = '<div class="printer-table-row"><div style="grid-column: 1 / -1; text-align: center; padding: 24px;">No vouchers found.</div></div>';
                    return;
                }

                tbody.innerHTML = data.vouchers.map(v => {
                    let statusHtml;
                    if (!v.is_active) {
                        statusHtml = '<span class="status-dot danger"></span> Deactivated';
                    } else if (v.is_expired) {
                        statusHtml = '<span class="status-dot danger"></span> Expired';
                    } else if (v.remaining_balance <= 0) {
                        statusHtml = '<span class="status-dot low"></span> Used';
                    } else {
                        statusHtml = '<span class="status-dot ok"></span> Active';
                    }

                    const btnText = v.is_active ? 'Deactivate' : 'Activate';
                    const btnClass = v.is_active ? 'btn-deactivate' : 'btn-activate';
                    const switchLabel = v.is_active ? 'Active' : 'Off';
                    const switchChecked = v.is_active ? 'checked' : '';

                    return `
                        <div class="printer-table-row voucher-row" data-voucher-id="${v.id}">
                            <div class="voucher-code-cell" data-label="Code"><strong>${v.code}</strong></div>
                            <div data-label="Original">₱${v.original_amount.toFixed(2)}</div>
                            <div data-label="Remaining">₱${v.remaining_balance.toFixed(2)}</div>
                            <div data-label="Status">${statusHtml}</div>
                            <div data-label="Created">${v.created_at}</div>
                            <div data-label="Expires">${v.expires_at}</div>
                            <div class="voucher-actions-cell" style="display:flex; align-items:center; gap:8px;">
                                <div class="switch">
                                    <input type="checkbox" class="switch-input-blue voucher-switch-input" id="voucher-switch-${v.id}" data-voucher-id="${v.id}" ${switchChecked}>
                                    <label class="switch-label-blue" for="voucher-switch-${v.id}">
                                        <span class="switch-circle">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none">
                                                <rect x="1" y="1" width="34" height="34" rx="17" fill="white" stroke="#18191F" stroke-width="2"/>
                                                <rect x="11" y="11" width="14" height="14" rx="7" stroke="#18191F" stroke-width="2"/>
                                            </svg>
                                        </span>
                                    </label>
                                </div>
                                <span class="voucher-switch-label">${switchLabel}</span>
                                <button class="voucher-delete-btn" data-voucher-id="${v.id}">Delete</button>
                            </div>
                        </div>
                    `;
                }).join('');

                attachToggleHandlers();
                if (typeof setupPagination === 'function') {
                    setupPagination('voucher-table-body', '.voucher-row', 'voucher-pagination', 5);
                }
            });
    }

    // Toggle voucher active state and delete
    function attachToggleHandlers() {
        // Switch toggle handler
        document.querySelectorAll('.voucher-switch-input').forEach(input => {
            input.addEventListener('change', function() {
                const voucherId = this.dataset.voucherId;
                fetch('/portal/api/toggle-voucher/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken
                    },
                    body: JSON.stringify({ id: parseInt(voucherId, 10) })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        loadVouchers();
                    }
                });
            });
        });

        // Legacy button handler (fallback)
        document.querySelectorAll('.voucher-toggle-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const voucherId = this.dataset.voucherId;
                fetch('/portal/api/toggle-voucher/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken
                    },
                    body: JSON.stringify({ id: parseInt(voucherId, 10) })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        loadVouchers();
                    }
                });
            });
        });

        document.querySelectorAll('.voucher-delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const voucherId = this.dataset.voucherId;
                if (!confirm('Are you sure you want to delete this voucher?')) return;
                fetch('/portal/api/delete-voucher/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken
                    },
                    body: JSON.stringify({ id: parseInt(voucherId, 10) })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        loadVouchers();
                    }
                });
            });
        });
    }

    // Search and filter
    let searchTimeout;
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(loadVouchers, 300);
        });
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', loadVouchers);
    }

    // Initial toggle handlers for server-rendered rows
    attachToggleHandlers();
    if (typeof setupPagination === 'function') {
        setupPagination('voucher-table-body', '.voucher-row', 'voucher-pagination', 5);
    }
})();