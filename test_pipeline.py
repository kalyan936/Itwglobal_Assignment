import os
import sys
import json
import time

# Ensure we can load local files
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import db
import research

def test_pipeline():
    print("=== STARTING PIPELINE VERIFICATION TEST ===")
    
    # 1. Clean Database
    print("\n1. Clearing database for test...")
    db.clear_all_meetings()
    
    # 2. Add Mock Meeting (Scenario A: Linear)
    print("\n2. Creating mock event for Linear...")
    meeting_id = db.create_meeting(
        title="Demo call with Linear",
        start_time="2026-06-22T16:00:00+05:30",
        description="Core dashboard integration discussion.",
        attendees="john@linear.app",
        status='pending'
    )
    print(f"Meeting created with ID: {meeting_id}")
    
    # Assert database insertion
    meeting = db.get_meeting(meeting_id)
    assert meeting is not None
    assert meeting['title'] == "Demo call with Linear"
    assert meeting['status'] == "pending"
    print("Database insert verified.")

    # 3. Add Mock Meeting (Scenario C: Personal / Ambiguous)
    print("\n3. Creating mock event for Ravi (Ambiguous)...")
    ambiguous_id = db.create_meeting(
        title="Catchup - Ravi",
        start_time="2026-06-23T10:00:00+05:30",
        description="Just checking in.",
        attendees="ravi@gmail.com",
        status='pending'
    )
    
    # 4. Run Inference/Research for Ambiguous Case
    print("\n4. Running research pipeline on Ambiguous Case...")
    research.run_research_pipeline(ambiguous_id)
    
    meeting_ambig = db.get_meeting(ambiguous_id)
    print(f"Ambiguous meeting status after pipeline: {meeting_ambig['status']}")
    assert meeting_ambig['status'] == 'unidentified'
    print("Graceful fallback verified.")

    # 5. Run Research for Linear Case
    print("\n5. Running research pipeline on Linear...")
    if not os.environ.get("GEMINI_API_KEY"):
        print("WARNING: GEMINI_API_KEY is not set. The research pipeline will run with fallbacks.")
        
    start_time_pipeline = time.time()
    research.run_research_pipeline(meeting_id)
    duration = time.time() - start_time_pipeline
    print(f"Pipeline completed in {duration:.2f} seconds.")

    # 6. Retrieve and Verify synthesized brief
    final_meeting = db.get_meeting(meeting_id)
    print(f"\nFinal Meeting Status: {final_meeting['status']}")
    print(f"Inferred Company Name: {final_meeting['company_name']}")
    print(f"Inferred Domain: {final_meeting['domain']}")
    
    print("\nBrief Results:")
    print(f"Company Description:\n{final_meeting.get('company_description')}")
    print(f"Recent News:\n{final_meeting.get('news')}")
    print(f"Tech Signals:\n{final_meeting.get('tech_signals')}")
    print(f"Pain Points:\n{final_meeting.get('pain_points')}")
    print(f"Talking Points:\n{final_meeting.get('talking_points')}")
    
    assert final_meeting['status'] == 'done'
    assert final_meeting['company_name'] is not None
    assert final_meeting['domain'] == 'linear.app'
    
    print("\n=== PIPELINE VERIFICATION SUCCESSFUL ===")

if __name__ == "__main__":
    test_pipeline()
