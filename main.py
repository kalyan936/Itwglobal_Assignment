import os
import json
from datetime import datetime, timedelta
from typing import Optional
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import db
import research
import gcal

app = FastAPI(title="Meeting Intelligence Agent")

# Allow CORS for development ease
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class MockMeetingRequest(BaseModel):
    title: str
    start_time: str  # ISO Format or nice text
    description: Optional[str] = ""
    attendees: Optional[str] = ""  # Comma-separated email list

class OAuthInitRequest(BaseModel):
    client_id: str
    client_secret: str
    redirect_uri: str

# Ensure static directory exists
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

# API Endpoints
@app.get("/api/meetings")
def get_meetings():
    try:
        return db.get_meetings()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/meetings/mock")
def create_mock_meeting(req: MockMeetingRequest, background_tasks: BackgroundTasks):
    try:
        meeting_id = db.create_meeting(
            title=req.title,
            start_time=req.start_time,
            description=req.description,
            attendees=req.attendees,
            status='pending'
        )
        
        # Trigger background research
        background_tasks.add_task(research.run_research_pipeline, meeting_id)
        
        return {"success": True, "meeting_id": meeting_id, "status": "pending"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/meetings/{meeting_id}/research")
def trigger_research(meeting_id: int, background_tasks: BackgroundTasks):
    meeting = db.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    db.update_meeting_status(meeting_id, 'pending')
    background_tasks.add_task(research.run_research_pipeline, meeting_id)
    return {"success": True, "status": "pending"}

@app.delete("/api/meetings/{meeting_id}")
def delete_meeting(meeting_id: int):
    try:
        db.delete_meeting(meeting_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/meetings/clear")
def clear_meetings():
    try:
        db.clear_all_meetings()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Google Calendar Integration Endpoints
@app.get("/api/gcal/status")
def get_gcal_status():
    config = gcal.get_config()
    client_id = ""
    client_secret = ""
    if config and "web" in config:
        client_id = config["web"].get("client_id", "")
        client_secret = config["web"].get("client_secret", "")
    return {
        "configured": gcal.is_gcal_configured(),
        "has_config": config is not None,
        "has_token": os.path.exists(gcal.TOKEN_FILE),
        "client_id": client_id,
        "client_secret": client_secret
    }

@app.post("/api/gcal/disconnect")
def disconnect_gcal():
    try:
        success = gcal.disconnect()
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/gcal/auth-url")
def get_gcal_auth_url(req: OAuthInitRequest):
    try:
        auth_url = gcal.get_auth_url(req.client_id, req.client_secret, req.redirect_uri)
        return {"success": True, "auth_url": auth_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/gcal/callback")
def gcal_callback(code: str, state: Optional[str] = None):
    # Retrieve config to get redirect uri
    config = gcal.get_config()
    if not config:
        return HTMLResponse("<html><body><h3>Error: Configuration lost. Please configure Google Calendar again.</h3></body></html>")
    
    redirect_uri = config['web']['redirect_uris'][0]
    
    try:
        gcal.save_token_from_code(code, redirect_uri)
        # Redirect back to homepage
        return RedirectResponse(url="/")
    except Exception as e:
        return HTMLResponse(f"<html><body><h3>OAuth Error: {str(e)}</h3><p><a href='/'>Go back to Dashboard</a></p></body></html>")

@app.post("/api/gcal/sync")
def sync_gcal(background_tasks: BackgroundTasks):
    res = gcal.sync_upcoming_events()
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Sync failed"))
        
    # Queue up background research tasks for each newly added meeting
    new_meetings = res.get("new_meetings", [])
    for meeting in new_meetings:
        background_tasks.add_task(research.run_research_pipeline, meeting["id"])
        
    return {
        "success": True,
        "synced_count": res.get("synced_count", 0),
        "message": f"Successfully pulled {res.get('synced_count')} new meetings from Google Calendar."
    }

# Serve root SPA index
@app.get("/", response_class=HTMLResponse)
def get_dashboard():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return f.read()
    return """
    <html>
        <body style="font-family: sans-serif; background-color: #0d0f12; color: #fff; text-align: center; padding-top: 100px;">
            <h1>Meeting Intelligence Dashboard</h1>
            <p>Static index.html not created yet. Please wait, the agent is building it!</p>
        </body>
    </html>
    """

# Mount static folder for CSS and JS
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    # Start app locally
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
