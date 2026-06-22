import sqlite3
import os
import json
from datetime import datetime

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "meetings.db")

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Create meetings table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            start_time TEXT NOT NULL,
            description TEXT,
            attendees TEXT,
            company_name TEXT,
            domain TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create briefs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS briefs (
            meeting_id INTEGER PRIMARY KEY,
            company_description TEXT,
            news TEXT,
            tech_signals TEXT,
            pain_points TEXT,
            talking_points TEXT, -- Stored as JSON or list
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
        )
    """)
    
    conn.commit()
    conn.close()

def create_meeting(title, start_time, description, attendees, status='pending'):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO meetings (title, start_time, description, attendees, status)
        VALUES (?, ?, ?, ?, ?)
    """, (title, start_time, description, attendees, status))
    meeting_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return meeting_id

def update_meeting_status(meeting_id, status, company_name=None, domain=None):
    conn = get_db()
    cursor = conn.cursor()
    if company_name is not None or domain is not None:
        cursor.execute("""
            UPDATE meetings 
            SET status = ?, company_name = ?, domain = ?
            WHERE id = ?
        """, (status, company_name, domain, meeting_id))
    else:
        cursor.execute("""
            UPDATE meetings 
            SET status = ?
            WHERE id = ?
        """, (status, meeting_id))
    conn.commit()
    conn.close()

def save_brief(meeting_id, company_description, news, tech_signals, pain_points, talking_points):
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if brief already exists
    cursor.execute("SELECT 1 FROM briefs WHERE meeting_id = ?", (meeting_id,))
    exists = cursor.fetchone()
    
    talking_points_str = json.dumps(talking_points) if isinstance(talking_points, list) else talking_points
    
    if exists:
        cursor.execute("""
            UPDATE briefs
            SET company_description = ?, news = ?, tech_signals = ?, pain_points = ?, talking_points = ?, updated_at = CURRENT_TIMESTAMP
            WHERE meeting_id = ?
        """, (company_description, news, tech_signals, talking_points_str, meeting_id))
    else:
        cursor.execute("""
            INSERT INTO briefs (meeting_id, company_description, news, tech_signals, pain_points, talking_points)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (meeting_id, company_description, news, tech_signals, pain_points, talking_points_str))
        
    conn.commit()
    conn.close()

def get_meetings():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT m.id, m.title, m.start_time, m.description, m.attendees, m.company_name, m.domain, m.status, m.created_at,
               b.company_description, b.news, b.tech_signals, b.pain_points, b.talking_points, b.updated_at
        FROM meetings m
        LEFT JOIN briefs b ON m.id = b.meeting_id
        ORDER BY datetime(m.start_time) ASC
    """)
    rows = cursor.fetchall()
    conn.close()
    
    meetings = []
    for r in rows:
        m = dict(r)
        # Parse talking points JSON if it exists
        if m.get('talking_points'):
            try:
                m['talking_points'] = json.loads(m['talking_points'])
            except:
                pass
        meetings.append(m)
    return meetings

def get_meeting(meeting_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT m.id, m.title, m.start_time, m.description, m.attendees, m.company_name, m.domain, m.status, m.created_at,
               b.company_description, b.news, b.tech_signals, b.pain_points, b.talking_points, b.updated_at
        FROM meetings m
        LEFT JOIN briefs b ON m.id = b.meeting_id
        WHERE m.id = ?
    """, (meeting_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        m = dict(row)
        if m.get('talking_points'):
            try:
                m['talking_points'] = json.loads(m['talking_points'])
            except:
                pass
        return m
    return None

def delete_meeting(meeting_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))
    conn.commit()
    conn.close()

def clear_all_meetings():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM meetings")
    conn.commit()
    conn.close()

# Initialize database tables on load
init_db()
