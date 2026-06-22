import os
import json
import datetime
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
import db

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gcal_config.json")
TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "token.json")

# If modifying these scopes, delete the file token.json.
SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

def save_config(client_id, client_secret, redirect_uri):
    config = {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uris": [redirect_uri],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token"
        }
    }
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

def get_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return None

def is_gcal_configured():
    return get_config() is not None and os.path.exists(TOKEN_FILE)

def disconnect():
    if os.path.exists(TOKEN_FILE):
        os.remove(TOKEN_FILE)
        return True
    return False


def get_auth_url(client_id, client_secret, redirect_uri):
    save_config(client_id, client_secret, redirect_uri)
    flow = Flow.from_client_config(
        get_config(),
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent'
    )
    return authorization_url

def save_token_from_code(code, redirect_uri):
    config = get_config()
    if not config:
        raise ValueError("Google Calendar client config not found. Please set Client ID and Client Secret first.")
    
    flow = Flow.from_client_config(
        config,
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )
    flow.fetch_token(code=code)
    credentials = flow.credentials
    
    token_data = {
        'token': credentials.token,
        'refresh_token': credentials.refresh_token,
        'token_uri': credentials.token_uri,
        'client_id': credentials.client_id,
        'client_secret': credentials.client_secret,
        'scopes': credentials.scopes
    }
    
    with open(TOKEN_FILE, 'w') as f:
        json.dump(token_data, f, indent=2)
        
    return token_data

def sync_upcoming_events():
    if not os.path.exists(TOKEN_FILE):
        return {"success": False, "message": "Google Calendar not connected. Please connect via OAuth."}
    
    try:
        with open(TOKEN_FILE, 'r') as f:
            token_data = json.load(f)
            
        credentials = Credentials(
            token_data['token'],
            refresh_token=token_data.get('refresh_token'),
            token_uri=token_data['token_uri'],
            client_id=token_data['client_id'],
            client_secret=token_data['client_secret'],
            scopes=token_data['scopes']
        )
        
        # Build service
        service = build('calendar', 'v3', credentials=credentials)
        
        now = datetime.datetime.utcnow().isoformat() + 'Z' # 'Z' indicates UTC time
        # Get events for the next 7 days
        time_max = (datetime.datetime.utcnow() + datetime.timedelta(days=7)).isoformat() + 'Z'
        
        events_result = service.events().list(
            calendarId='primary', 
            timeMin=now,
            timeMax=time_max,
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        
        events = events_result.get('items', [])
        
        new_meetings = []
        
        existing_meetings = db.get_meetings()
        existing_keys = {(m['title'], m['start_time']) for m in existing_meetings}
        
        for event in events:
            title = event.get('summary', 'Untitled Meeting')
            start = event.get('start', {})
            start_time = start.get('dateTime') or start.get('date')
            description = event.get('description', '')
            
            # Format start time to ISO string or nice format
            if start_time:
                # e.g., '2026-06-22T15:00:00+05:30'
                pass
            else:
                continue
                
            attendees = event.get('attendees', [])
            attendee_emails = [a.get('email') for a in attendees if a.get('email')]
            attendees_str = ",".join(attendee_emails)
            
            # Prevent duplicates
            if (title, start_time) not in existing_keys:
                meeting_id = db.create_meeting(
                    title=title,
                    start_time=start_time,
                    description=description,
                    attendees=attendees_str,
                    status='pending'
                )
                new_meetings.append({
                    "id": meeting_id,
                    "title": title,
                    "start_time": start_time,
                    "description": description,
                    "attendees": attendees_str
                })
                
        return {"success": True, "synced_count": len(new_meetings), "new_meetings": new_meetings}
        
    except Exception as e:
        print(f"Error syncing with Google Calendar: {e}")
        return {"success": False, "message": str(e)}
