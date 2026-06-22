# Meeting Intelligence Agent

An autonomous intelligence agent that monitors a user's calendar, detects upcoming external calls, researches the participating companies, and displays prepared briefings in a premium, real-time updated dashboard—all without the user needing to ask.

Built entirely using **free, developer-friendly resources**: FastAPI, SQLite, and vanilla HTML/JavaScript/CSS.

---

## Key Features

1. **Calendar Listener & Sync**:
   - **Google Calendar API**: Pulls upcoming meetings using official Google API clients.
   - **Interactive Simulator**: Allows instant injection of custom meetings to watch the background research pipeline running.
2. **Autonomous Research Pipeline**:
   - **Source 1: Custom Web Scraper**: Crawls the company's landing page and extracts headings, summaries, and checks script resources to identify tech signals (React, HubSpot, Segment, Stripe, etc.).
   - **Source 2: News Search**: Queries Tavily Search API (or DuckDuckGo as a keyless, free fallback) for recent news, product launches, or funding in the last 60-90 days.
   - **Synthesis Engine**: Uses the **Gemini 2.5 Flash** LLM to build plain-language briefs, inferred pain points, and specific suggested talking points.
3. **Responsive Glassmorphism Dashboard**:
   - High-fidelity dark mode with neon accents and CSS glass panels.
   - Blinking live status indicators showing *Pending*, *Researching*, *Prepared*, or *Personal/Ambiguous*.
   - Intelligent fallback states for internal/personal catchups.
   - Automatic 6-second polling to display briefs in real-time as background tasks complete.

---

## Tech Stack

- **Backend**: FastAPI (Python 3.14)
- **Database**: SQLite3 (persistent local database file `meetings.db`)
- **Frontend**: Vanilla HTML5, ES6 JavaScript, Vanilla CSS (with Outfit & Inter Google Fonts)
- **AI / LLM**: Gemini 2.5 Flash (using `google-generativeai` SDK)
- **Web Crawling**: BeautifulSoup4 & Requests

---

## File Structure

```text
g:/Assignment/
├── main.py            # FastAPI Application Entrypoint (Serves APIs & static frontend)
├── db.py              # SQLite Database Operations & Table Initialization
├── research.py        # Domain Extraction, Site Scraper, DDG/Tavily Search & LLM Synthesis
├── gcal.py            # Google Calendar API OAuth Integration & Event Fetcher
├── test_pipeline.py   # Synchronous End-to-End Pipeline Verification Script
├── static/
│   ├── index.html     # Dashboard layout, Drawers, and Preset Selectors
│   ├── style.css      # Custom dark-theme glassmorphism and animations stylesheet
│   └── app.js         # Client-side API integrations, state polling, and rendering logic
├── venv/              # Python Virtual Environment
└── README.md          # Project documentation and guide
```

---

## Installation & Setup

### 1. Clone & Set Up Directory
Ensure you are in the workspace folder and verify Python 3.10+ is installed:
```bash
python --version
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your values, or set environment variables in your terminal:
```env
# Required for research synthesis & domain extraction
GEMINI_API_KEY=your_gemini_api_key_here

# Required for direct Google Calendar OAuth via the backend API
GOOGLE_CALENDAR_CLIENT_ID=your_google_client_id_here
GOOGLE_CALENDAR_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_CALENDAR_REDIRECT_URI=http://127.0.0.1:8000/api/gcal/callback

# Optional: Set this to use Tavily's high-quality search. If missing, the agent falls back to DuckDuckGo HTML searching.
TAVILY_API_KEY=your_tavily_api_key_here

# Optional for GitHub Pages or other static hosting: point the frontend to your deployed backend.
API_BASE_URL=https://your-backend-host.example.com
```

### 3. Create Virtual Environment & Install Dependencies
```bash
# Create Virtual Environment
python -m venv venv

# Activate Virtual Environment (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Install required libraries
pip install fastapi uvicorn beautifulsoup4 google-generativeai requests python-dotenv google-api-python-client google-auth-httplib2 google-auth-oauthlib
```

### 4. Run the Verification Test
Verify the system from calendar domain parsing to Gemini synthesis runs correctly:
```bash
python test_pipeline.py
```
*This script runs mock meetings directly through the database and asserts successful preparation.*

### 5. Connect Google Calendar
Open the dashboard and click **Connect Google Calendar**. The browser will hit the backend API route `/api/gcal/connect`, which starts OAuth without asking you to paste the client ID or client secret into the UI.

### 6. GitHub Pages Deployment
If you host the frontend on GitHub Pages, make sure the repository includes a root-level `index.html` and publish the repository root, not only the `static/` folder. The frontend uses relative asset paths like `static/style.css` and `static/app.js`, so Pages can load them correctly from the root site.

If you also want the live dashboard features, deploy the backend separately and set `API_BASE_URL` to that backend host. Without it, browser requests like `/api/meetings` and `/api/gcal/connect` will go to `github.io` and return 404.

---

## How to Run Locally

Start the uvicorn development server:
```bash
python main.py
```

The terminal will display:
```text
INFO:     Started server process [1234]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Open your browser and navigate to **[http://127.0.0.1:8000](http://127.0.0.1:8000)** to view the dashboard.

---

## Testing with a New Google Calendar Account

To test the system with a different Google account:
1. **Clear Existing Meetings (Optional)**: Click **Reset** in the top-right header to clean the local database.
2. **Disconnect Calendar**: Open the **Connect Calendar** panel and click **Disconnect**. This removes the active access token but retains your OAuth Client ID/Secret settings.
3. **Re-authenticate**: Click **Authenticate & Connect** in the drawer and choose/log in to your **new Google Account** when prompted.
4. **Sync Calendar**: Click **Sync Sync** to import and research meetings from your new account.

---

## Demonstration Scenarios (Simulation Drawer)

You can test the agent's autonomous behavior using the Simulator Panel inside the dashboard:

- **Scenario A — Clear Company Name**: Title: "Demo call with Linear", Attendees: `john@linear.app`.
  *Agent action: Infers Linear (linear.app), scrapes home page, finds recent news, detects stack (React/Next.js/Netlify/Sentry), and synthesizes tailored talking points on AI features.*
- **Scenario B — Company Inferred from Attendee Email**: Title: "Intro call with Priya", Attendees: `priya@growthsignal.io`.
  *Agent action: Extracts growthsignal.io domain, scrapes website description, checks recent news/funding (pre-seed B2B SaaS in revenue intelligence), and infers pain points like ICP definition.*
- **Scenario C — Ambiguous or Missing Data**: Title: "Catchup - Ravi", Attendees: `ravi@gmail.com`.
  *Agent action: Detects personal email domain, rejects inference, and gracefully sets card status to Personal/Ambiguous with an informative fallback notice.*
