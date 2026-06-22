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
const DEFAULT_MEETINGS = [
    {
        id: 1,
        title: 'Demo call with Linear',
        start_time: '2026-06-22T21:00:00',
        attendees: 'john@linear.app',
        status: 'done',
        company_name: 'Linear',
        domain: 'linear.app',
        company_description: 'Linear is a modern issue tracking and project planning platform for product teams.',
        news: '- Linear has been pushing on AI-assisted workflows and collaboration improvements.\n- Their product focus remains on speed, clarity, and team execution.',
        pain_points: '- Reducing process overhead\n- Improving engineering throughput\n- Keeping work visible across teams',
        tech_signals: '- Modern web product\n- Strong product-led motion\n- Team collaboration tooling',
        talking_points: [
            'How are you reducing planning overhead for engineers?',
            'Where does team visibility break down today?',
            'What does success look like for the next quarter?'
        ]
    },
    {
        id: 2,
        title: 'Intro call with GrowthSignal',
        start_time: '2026-06-23T13:30:00',
        attendees: 'priya@growthsignal.io',
        status: 'researching',
        company_name: 'GrowthSignal',
        domain: 'growthsignal.io'
    },
    {
        id: 3,
        title: 'Catchup - Ravi',
        start_time: '2026-06-23T16:00:00',
        attendees: 'ravi@gmail.com',
        status: 'unidentified'
    }
];

let meetingsState = JSON.parse(JSON.stringify(DEFAULT_MEETINGS));

function buildDemoBrief(meeting) {
    const firstEmail = (meeting.attendees || '').split(',')[0]?.trim() || '';
    const domain = firstEmail.includes('@') ? firstEmail.split('@')[1].toLowerCase() : '';
    const personalDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];

    if (!domain || personalDomains.includes(domain)) {
        return {
            ...meeting,
            status: 'unidentified',
            company_name: '',
            domain: '',
            company_description: 'No company could be identified from the meeting details.',
            news: 'No public company activity detected.',
            pain_points: 'No company context available.',
            tech_signals: '',
            talking_points: ['Ask for the company name and project context.']
        };
    }

    const companyName = meeting.title.replace(/^(Demo call with |Intro call with |Catchup - )/i, '').trim() || domain.split('.')[0];
    const prettyCompany = companyName.charAt(0).toUpperCase() + companyName.slice(1);

    return {
        ...meeting,
        status: 'done',
        company_name: prettyCompany,
        domain,
        company_description: `${prettyCompany} is a company inferred from the meeting context and attendee domain.`,
        news: `- Recent activity for ${prettyCompany} is not connected to a live backend in this Pages-only demo.\n- This brief is generated locally in the browser.`,
        pain_points: '- Browser-only demo mode\n- No live research backend\n- Use the simulator to explore local meeting states',
        tech_signals: '- Static GitHub Pages deployment\n- Browser-rendered demo cards',
        talking_points: [
            `What problem is ${prettyCompany} solving today?`,
            'Which metrics matter most for this conversation?',
            'What should be different after the next 90 days?'
        ]
    };
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

    renderDashboard();
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

function renderDashboard() {
    renderMeetings(meetingsState);
    fetchGcalStatus();
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
    renderMeetings(meetingsState);
}

// Fetch Google Calendar integration status
async function fetchGcalStatus() {
    if (!gcalStatusBox) return;

    gcalStatusBox.innerHTML = `<i class="fa-solid fa-circle-info" style="color: var(--cyan)"></i> GitHub Pages-only demo. Calendar sync is disabled in this build.`;
    gcalStatusBox.style.borderColor = 'rgba(34, 211, 238, 0.35)';
    gcalStatusBox.style.color = '#bae6fd';
    btnGcalConfig.innerHTML = `<i class="fa-solid fa-circle-info"></i> Pages Demo`;
}

// Disconnect Google Calendar
async function handleGcalDisconnect(e) {
    e.preventDefault();
    showStatusBanner('GitHub Pages-only demo: disconnect is not available.', 4000);
}

// Connect Google Calendar via backend OAuth redirect
function connectGoogleCalendar() {
    showStatusBanner('GitHub Pages-only demo: calendar connection is disabled.', 4500);
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
    showStatusBanner('GitHub Pages-only demo: sync is disabled. Use the simulator instead.', 5000);
}

// Clear all meetings
async function clearAllMeetings() {
    if (!confirm('Reset demo meetings to the default sample set?')) return;

    meetingsState = [
        ...buildDefaultMeetings()
    ];
    renderDashboard();
    showStatusBanner('Demo meetings reset.', 3000);
}

// Manually trigger research
async function triggerResearch(meetingId) {
    meetingsState = meetingsState.map(meeting => {
        if (meeting.id !== meetingId) return meeting;
        return { ...meeting, status: 'researching' };
    });
    renderMeetings(meetingsState);
    showStatusBanner('Researching locally in the browser demo.', 2500);

    setTimeout(() => {
        meetingsState = meetingsState.map(meeting => {
            if (meeting.id !== meetingId) return meeting;
            return buildDemoBrief(meeting);
        });
        renderMeetings(meetingsState);
    }, 1200);
}

// Delete meeting
async function deleteMeeting(meetingId) {
    if (!confirm('Delete this demo meeting?')) return;

    meetingsState = meetingsState.filter(meeting => meeting.id !== meetingId);
    renderMeetings(meetingsState);
    showStatusBanner('Meeting removed from the demo board.', 3000);
}

// Mock Event Submission (Simulation Mode)
async function handleMockEventSubmit(e) {
    e.preventDefault();
    
    const title = document.getElementById('mock-title').value;
    const start_time = document.getElementById('mock-time').value;
    const attendees = document.getElementById('mock-attendees').value;
    const description = document.getElementById('mock-desc').value;

    toggleDrawer('sim', false);
    showStatusBanner('Injected event into the browser demo.', 4000);

    const newMeeting = {
        id: Date.now(),
        title,
        start_time,
        attendees,
        description,
        status: 'researching'
    };

    meetingsState = [newMeeting, ...meetingsState];
    renderMeetings(meetingsState);
    mockEventForm.reset();

    setTimeout(() => {
        meetingsState = meetingsState.map(meeting => {
            if (meeting.id !== newMeeting.id) return meeting;
            return buildDemoBrief(meeting);
        });
        renderMeetings(meetingsState);
    }, 1200);
}

// Polling Loop
function startPolling() {
    return;
}

function buildDefaultMeetings() {
    return JSON.parse(JSON.stringify(DEFAULT_MEETINGS));
}
