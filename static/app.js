// Client-side Application Logic - Meeting Intelligence Agent

// DOM Elements
const meetingsGrid = document.getElementById('meetings-grid');
const btnGcalConfig = document.getElementById('btn-gcal-config');
const btnSyncNow = document.getElementById('btn-sync-now');
const btnOpenSimulator = document.getElementById('btn-open-simulator');
const btnClearAll = document.getElementById('btn-clear-all');

// Drawer Elements
const gcalDrawer = document.getElementById('gcal-drawer');
const gcalOverlay = document.getElementById('gcal-drawer-overlay');
const gcalClose = document.getElementById('gcal-drawer-close');
const gcalStatusBox = document.getElementById('gcal-connection-status');
const btnGcalConnect = document.getElementById('btn-gcal-connect');

const simDrawer = document.getElementById('sim-drawer');
const simOverlay = document.getElementById('sim-drawer-overlay');
const simClose = document.getElementById('sim-drawer-close');
const mockEventForm = document.getElementById('mock-event-form');

// Global State
let pollingInterval = null;
const  API_BASE_URL = document.querySelector('meta[name="api-base-url"]')?.content?.trim()
    || window.__API_BASE_URL__
    || '';
const IS_GITHUB_PAGES = window.location.hostname.endsWith('github.io');

function hasBackend() {
    return Boolean(API_BASE_URL);
}

function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
}

function getBackendHint() {
    if (API_BASE_URL) {
        return `Configured backend: ${API_BASE_URL}`;
    }

    if (IS_GITHUB_PAGES) {
        return 'Set config.js in the repo root to your backend URL, or define window.__API_BASE_URL__ before loading static/app.js.';
    }

    return 'Start the FastAPI backend locally at http://127.0.0.1:8000.';
}

function showBackendRequiredState() {
    meetingsGrid.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon"><i class="fa-solid fa-cloud-slash" style="color: var(--status-unidentified)"></i></div>
            <h3>GitHub Pages mode</h3>
            <p>This frontend is deployed statically, so API requests are disabled until you point <strong>API_BASE_URL</strong> at a separate backend.</p>
            <p class="form-help" style="margin-top: 12px;">${getBackendHint()}</p>
        </div>
    `;

    if (gcalStatusBox) {
        gcalStatusBox.innerHTML = `<i class="fa-solid fa-circle-info" style="color: var(--status-unidentified)"></i> ${getBackendHint()}`;
        gcalStatusBox.style.borderColor = 'var(--status-unidentified)';
        gcalStatusBox.style.color = '#fef3c7';
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Set Default Time in Simulator (current time + 2 hours)
    setDefaultMockTime();

    // Event Listeners
    btnGcalConfig.addEventListener('click', () => toggleDrawer('gcal', true));
    gcalClose.addEventListener('click', () => toggleDrawer('gcal', false));
    gcalOverlay.addEventListener('click', () => toggleDrawer('gcal', false));
    
    btnOpenSimulator.addEventListener('click', () => toggleDrawer('sim', true));
    simClose.addEventListener('click', () => toggleDrawer('sim', false));
    simOverlay.addEventListener('click', () => toggleDrawer('sim', false));

    btnSyncNow.addEventListener('click', triggerGcalSync);
    btnClearAll.addEventListener('click', clearAllMeetings);
    if (btnGcalConnect) {
        btnGcalConnect.addEventListener('click', connectGoogleCalendar);
    }
    mockEventForm.addEventListener('submit', handleMockEventSubmit);

    // Initial load
    if (IS_GITHUB_PAGES && !hasBackend()) {
        showBackendRequiredState();
    } else {
        fetchMeetings();
        fetchGcalStatus();
    }

    // Start auto polling (every 6 seconds)
    startPolling();
});

// Drawer Functions
function toggleDrawer(type, show) {
    if (type === 'gcal') {
        if (show) {
            gcalDrawer.classList.add('active');
            gcalOverlay.classList.add('active');
            fetchGcalStatus();
        } else {
            gcalDrawer.classList.remove('active');
            gcalOverlay.classList.remove('active');
        }
    } else if (type === 'sim') {
        if (show) {
            simDrawer.classList.add('active');
            simOverlay.classList.add('active');
            setDefaultMockTime();
        } else {
            simDrawer.classList.remove('active');
            simOverlay.classList.remove('active');
        }
    }
}

function setDefaultMockTime() {
    const timeInput = document.getElementById('mock-time');
    if (timeInput) {
        const now = new Date();
        now.setHours(now.getHours() + 2);
        // Format to YYYY-MM-DDTHH:MM
        const offsetMs = now.getTimezoneOffset() * 60 * 1000;
        const localISOTime = new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
        timeInput.value = localISOTime;
    }
}

// Preset Loader
function loadPreset(key) {
    const titleInput = document.getElementById('mock-title');
    const attendeesInput = document.getElementById('mock-attendees');
    const descInput = document.getElementById('mock-desc');
    const timeInput = document.getElementById('mock-time');

    const now = new Date();
    
    if (key === 'linear') {
        titleInput.value = "Demo call with Linear";
        attendeesInput.value = "john@linear.app";
        descInput.value = "Walkthrough of our sales tool integration and discussing their current engineering coordination processes.";
        
        now.setHours(now.getHours() + 2);
    } else if (key === 'growthsignal') {
        titleInput.value = "Intro call with Priya";
        attendeesInput.value = "priya@growthsignal.io";
        descInput.value = "Introductory meeting to discuss GrowthSignal's pipeline, revenue intelligence features, and potential partnership opportunity.";
        
        now.setHours(now.getHours() + 4);
    } else if (key === 'ravi') {
        titleInput.value = "Catchup - Ravi";
        attendeesInput.value = "ravi@gmail.com";
        descInput.value = "General catchup and chat over virtual coffee.";
        
        now.setDate(now.getDate() + 1);
    }

    const offsetMs = now.getTimezoneOffset() * 60 * 1000;
    const localISOTime = new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
    timeInput.value = localISOTime;
}

// Banner Utility
function showStatusBanner(message, duration = 5000) {
    const banner = document.getElementById('status-banner');
    const text = document.getElementById('status-banner-text');
    
    text.textContent = message;
    banner.classList.remove('hidden');
    
    if (duration > 0) {
        setTimeout(() => {
            hideStatusBanner();
        }, duration);
    }
}

function hideStatusBanner() {
    const banner = document.getElementById('status-banner');
    banner.classList.add('hidden');
}

// Fetch Meetings list
async function fetchMeetings() {
    if (IS_GITHUB_PAGES && !hasBackend()) {
        showBackendRequiredState();
        return;
    }

    try {
        const resp = await fetch(apiUrl('/api/meetings'));
        if (!resp.ok) throw new Error("Failed to fetch meetings");
        const meetings = await resp.json();
        renderMeetings(meetings);
    } catch (err) {
        console.error("Error fetching meetings:", err);
        meetingsGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fa-solid fa-circle-exclamation" style="color: var(--status-failed)"></i></div>
                <h3>Failed to load meetings</h3>
                <p>${err.message}. Please verify the backend service is running.</p>
            </div>
        `;
    }
}

// Fetch Google Calendar integration status
async function fetchGcalStatus() {
    if (IS_GITHUB_PAGES && !hasBackend()) {
        showBackendRequiredState();
        return;
    }

    try {
        const resp = await fetch(apiUrl('/api/gcal/status'));
        const status = await resp.json();
        
        if (status.configured) {
            gcalStatusBox.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span><i class="fa-solid fa-circle-check" style="color: var(--status-done)"></i> Connected to Google Calendar</span>
                    <button class="btn btn-danger" id="btn-gcal-disconnect" style="padding: 4px 8px; font-size: 11px; margin-left: 10px;">Disconnect</button>
                </div>
            `;
            gcalStatusBox.style.borderColor = 'var(--status-done)';
            gcalStatusBox.style.color = '#a7f3d0';
            btnGcalConfig.innerHTML = `<i class="fa-solid fa-calendar-check" style="color: var(--status-done)"></i> Calendar Connected`;
            
            // Add listener to disconnect button
            const disconnectBtn = document.getElementById('btn-gcal-disconnect');
            if (disconnectBtn) {
                disconnectBtn.addEventListener('click', handleGcalDisconnect);
            }
        } else {
            gcalStatusBox.innerHTML = `<i class="fa-solid fa-circle-xmark" style="color: var(--status-unidentified)"></i> Not connected. Use the direct connect button below.`;
            gcalStatusBox.style.borderColor = 'var(--status-unidentified)';
            gcalStatusBox.style.color = '#fef3c7';
            btnGcalConfig.innerHTML = `<i class="fa-brands fa-google"></i> Connect Calendar`;
        }
    } catch (err) {
        console.error("Error fetching gcal status:", err);
    }
}

// Disconnect Google Calendar
async function handleGcalDisconnect(e) {
    e.preventDefault();
    if (IS_GITHUB_PAGES && !hasBackend()) {
        showStatusBanner('Connect a backend before managing Google Calendar from GitHub Pages.', 5000);
        return;
    }

    if (!confirm("Are you sure you want to disconnect this Google account? Your credentials config will be saved, but the access token will be removed.")) return;
    try {
        const resp = await fetch(apiUrl('/api/gcal/disconnect'), { method: 'POST' });
        if (!resp.ok) throw new Error("Failed to disconnect");
        showStatusBanner("Google Calendar disconnected successfully.", 3000);
        fetchGcalStatus();
    } catch (err) {
        showStatusBanner(`Disconnect failed: ${err.message}`, 5000);
    }
}

// Connect Google Calendar via backend OAuth redirect
function connectGoogleCalendar() {
    if (!hasBackend() && IS_GITHUB_PAGES) {
        showStatusBanner('Set API_BASE_URL to your backend host before connecting Google Calendar on GitHub Pages.', 6000);
        return;
    }

    window.location.href = apiUrl('/api/gcal/connect');
}

// Render meetings cards
function renderMeetings(meetings) {
    if (!meetings || meetings.length === 0) {
        meetingsGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fa-solid fa-calendar-plus"></i></div>
                <h3>No meetings detected</h3>
                <p>Use the Simulation Drawer to inject a test calendar invite or connect your Google Calendar to load real events.</p>
                <button class="btn btn-primary" onclick="toggleDrawer('sim', true)">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Open Simulator
                </button>
            </div>
        `;
        return;
    }

    meetingsGrid.innerHTML = meetings.map(meeting => {
        // Format start time nicely
        const startRaw = new Date(meeting.start_time);
        const formattedTime = isNaN(startRaw) ? meeting.start_time : startRaw.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Email list to chips
        const emails = meeting.attendees ? meeting.attendees.split(',') : [];
        const emailChips = emails.map(email => `
            <span class="attendee-chip"><i class="fa-solid fa-envelope"></i> ${email.trim()}</span>
        `).join('');

        // Card Actions
        const actionButtons = `
            <button class="btn-card-action" onclick="triggerResearch(${meeting.id})" title="Rerun research pipeline">
                <i class="fa-solid fa-rotate"></i>
            </button>
            <button class="btn-card-action btn-delete" onclick="deleteMeeting(${meeting.id})" title="Delete meeting">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;

        // Render card states based on research status
        let badgeHtml = '';
        let contentHtml = '';

        if (meeting.status === 'pending') {
            badgeHtml = `<span class="badge badge-pending"><i class="fa-solid fa-hourglass-start"></i> Syncing...</span>`;
            contentHtml = `
                <div class="loading-brief-card">
                    <div class="spinner"></div>
                    <p>Meeting detected. Queueing research pipeline...</p>
                </div>
            `;
        } else if (meeting.status === 'researching') {
            badgeHtml = `<span class="badge badge-researching"><i class="fa-solid fa-magnifying-glass animate-spin"></i> Researching...</span>`;
            contentHtml = `
                <div class="loading-brief-card">
                    <div class="spinner" style="border-top-color: var(--status-researching)"></div>
                    <p>Scraping company website and fetching news updates...</p>
                </div>
            `;
        } else if (meeting.status === 'failed') {
            badgeHtml = `<span class="badge badge-failed"><i class="fa-solid fa-circle-xmark"></i> Failed</span>`;
            contentHtml = `
                <div class="fallback-brief-card" style="background: rgba(239, 68, 68, 0.03); border-color: rgba(239, 68, 68, 0.25); color: #fca5a5">
                    <i class="fa-solid fa-triangle-exclamation" style="color: var(--status-failed)"></i>
                    <div>
                        <p>Research pipeline failed. The external website might be down, blocked, or search rate limits were exceeded.</p>
                        <button class="btn btn-secondary" onclick="triggerResearch(${meeting.id})" style="margin-top: 10px; padding: 6px 12px; font-size: 12px;">
                            <i class="fa-solid fa-rotate-left"></i> Retry Research
                        </button>
                    </div>
                </div>
            `;
        } else if (meeting.status === 'unidentified') {
            badgeHtml = `<span class="badge badge-unidentified"><i class="fa-solid fa-user-tag"></i> Personal / Ambiguous</span>`;
            contentHtml = `
                <div class="fallback-brief-card">
                    <i class="fa-solid fa-circle-question"></i>
                    <div>
                        <p>Company could not be identified for this meeting.</p>
                        <small>Reason: Meeting details contain personal/free emails only (like Gmail, Yahoo), and no company name was found in the title or description.</small>
                    </div>
                </div>
            `;
        } else if (meeting.status === 'done') {
            badgeHtml = `<span class="badge badge-done"><i class="fa-solid fa-circle-check"></i> Prepared</span>`;
            
            // Format Tech Signals as pills or bullet points
            let techPillsHtml = '';
            if (meeting.tech_signals) {
                // If it is bullet points (e.g. starting with - or *), let's render it as list, or extract words to show as badges
                const lines = meeting.tech_signals.split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
                techPillsHtml = lines.map(line => `<span class="tech-pill">${line}</span>`).join('');
            }

            // Parse suggested talking points
            let talkingPointsHtml = '';
            if (meeting.talking_points) {
                let pts = [];
                if (Array.isArray(meeting.talking_points)) {
                    pts = meeting.talking_points;
                } else if (typeof meeting.talking_points === 'string') {
                    try {
                        pts = JSON.parse(meeting.talking_points);
                    } catch (e) {
                        pts = meeting.talking_points.split('\n').map(p => p.replace(/^[-*•\d]\s*/, '').trim()).filter(Boolean);
                    }
                }
                
                talkingPointsHtml = pts.map(pt => `
                    <div class="talking-point-item">${pt}</div>
                `).join('');
            } else {
                talkingPointsHtml = `<div class="talking-point-item" style="border-left-color: var(--text-muted); color: var(--text-muted)">No suggested talking points synthesized.</div>`;
            }

            contentHtml = `
                <div class="brief-container">
                    <div class="brief-main">
                        <div class="brief-section">
                            <h4><i class="fa-solid fa-circle-info"></i> What they do</h4>
                            <p>${meeting.company_description || 'Company description not available.'}</p>
                        </div>
                        <div class="brief-section">
                            <h4><i class="fa-solid fa-newspaper"></i> Recent Activity (Last 60-90 Days)</h4>
                            <div>${marked.parse(meeting.news || 'No recent activity retrieved.')}</div>
                        </div>
                    </div>
                    <div class="brief-sidebar">
                        <div class="brief-section">
                            <h4><i class="fa-solid fa-microchip"></i> Tech Signals</h4>
                            <div class="tech-pills">${techPillsHtml}</div>
                        </div>
                        <div class="brief-section">
                            <h4><i class="fa-solid fa-bolt-lightning"></i> Inferred Pain Points</h4>
                            <div>${marked.parse(meeting.pain_points || 'No pain points inferred.')}</div>
                        </div>
                        <div class="brief-section talking-points-box">
                            <h4><i class="fa-regular fa-comment-dots"></i> Suggested Talking Points</h4>
                            <div class="talking-points-list">${talkingPointsHtml}</div>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <article class="meeting-card" id="meeting-card-${meeting.id}">
                <div class="card-header">
                    <div class="meeting-meta">
                        <h3>${meeting.title}</h3>
                        <div class="time-row">
                            <i class="fa-regular fa-clock"></i> <span>${formattedTime}</span>
                        </div>
                        ${meeting.company_name ? `<div style="font-size: 13px; font-weight: 600; color: var(--cyan); margin-top: 6px;"><i class="fa-solid fa-building"></i> Company: ${meeting.company_name} (${meeting.domain})</div>` : ''}
                        <div class="attendees-row">
                            ${emailChips}
                        </div>
                    </div>
                    <div class="card-actions">
                        ${badgeHtml}
                        ${actionButtons}
                    </div>
                </div>
                <div class="card-body">
                    ${contentHtml}
                </div>
            </article>
        `;
    }).join('');
}

// Trigger Google Calendar Sync
async function triggerGcalSync() {
    if (IS_GITHUB_PAGES && !hasBackend()) {
        showStatusBanner('Connect a backend before syncing Google Calendar on GitHub Pages.', 5000);
        return;
    }

    try {
        btnSyncNow.disabled = true;
        btnSyncNow.innerHTML = `<i class="fa-solid fa-rotate animate-spin"></i> Syncing...`;
        showStatusBanner("Connecting and syncing Google Calendar events...", 0);

        const resp = await fetch(apiUrl('/api/gcal/sync'), { method: 'POST' });
        
        if (resp.status === 400) {
            // Calendar not connected
            toggleDrawer('gcal', true);
            showStatusBanner("Please connect your Google Account first to run sync.", 5000);
            return;
        }

        if (!resp.ok) throw new Error("Sync failed");
        
        const data = await resp.json();
        showStatusBanner(`Sync completed! ${data.synced_count} new meetings added to pipeline.`, 5000);
        fetchMeetings();
    } catch (err) {
        console.error("Gcal sync error:", err);
        showStatusBanner(`Sync failed: ${err.message}`, 5000);
    } finally {
        btnSyncNow.disabled = false;
        btnSyncNow.innerHTML = `<i class="fa-solid fa-rotate"></i> Sync Sync`;
    }
}

// Clear all meetings
async function clearAllMeetings() {
    if (IS_GITHUB_PAGES && !hasBackend()) {
        showStatusBanner('Connect a backend before clearing meetings on GitHub Pages.', 5000);
        return;
    }

    if (!confirm("Are you sure you want to clear all meetings? This resets the demo dashboard.")) return;
    
    try {
        const resp = await fetch(apiUrl('/api/meetings/clear'), { method: 'POST' });
        if (!resp.ok) throw new Error("Failed to clear meetings");
        showStatusBanner("All meetings cleared successfully.", 3000);
        fetchMeetings();
    } catch (err) {
        showStatusBanner(`Failed: ${err.message}`, 5000);
    }
}

// Manually trigger research
async function triggerResearch(meetingId) {
    if (IS_GITHUB_PAGES && !hasBackend()) {
        showStatusBanner('Connect a backend before queuing research on GitHub Pages.', 5000);
        return;
    }

    try {
        showStatusBanner("Queued meeting for research.", 3000);
        const resp = await fetch(apiUrl(`/api/meetings/${meetingId}/research`), { method: 'POST' });
        if (!resp.ok) throw new Error("Failed to queue research");
        fetchMeetings();
    } catch (err) {
        showStatusBanner(`Error: ${err.message}`, 5000);
    }
}

// Delete meeting
async function deleteMeeting(meetingId) {
    if (IS_GITHUB_PAGES && !hasBackend()) {
        showStatusBanner('Connect a backend before deleting meetings on GitHub Pages.', 5000);
        return;
    }

    if (!confirm("Delete this meeting?")) return;
    try {
        const resp = await fetch(apiUrl(`/api/meetings/${meetingId}`), { method: 'DELETE' });
        if (!resp.ok) throw new Error("Failed to delete");
        showStatusBanner("Meeting deleted.", 3000);
        fetchMeetings();
    } catch (err) {
        showStatusBanner(`Delete failed: ${err.message}`, 5000);
    }
}

// Mock Event Submission (Simulation Mode)
async function handleMockEventSubmit(e) {
    e.preventDefault();

    if (IS_GITHUB_PAGES && !hasBackend()) {
        showStatusBanner('Connect a backend before using the simulator on GitHub Pages.', 5000);
        return;
    }
    
    const title = document.getElementById('mock-title').value;
    const start_time = document.getElementById('mock-time').value;
    const attendees = document.getElementById('mock-attendees').value;
    const description = document.getElementById('mock-desc').value;

    toggleDrawer('sim', false);
    showStatusBanner("Simulated event injected! Background research pipeline triggered.", 5000);

    try {
        const resp = await fetch(apiUrl('/api/meetings/mock'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                start_time,
                attendees,
                description
            })
        });
        
        if (!resp.ok) throw new Error("Simulator submission failed");
        
        // Reset form
        mockEventForm.reset();
        
        // Refresh grid
        fetchMeetings();
    } catch (err) {
        showStatusBanner(`Simulation Inject failed: ${err.message}`, 5000);
    }
}

// Polling Loop
function startPolling() {
    if (IS_GITHUB_PAGES && !hasBackend()) {
        return;
    }

    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
        fetchMeetings();
    }, 6000); // Poll every 6 seconds
}
