import os
import json
import requests
from bs4 import BeautifulSoup
import urllib.parse
import google.generativeai as genai
import db

# Configure Gemini
api_key = os.environ.get("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

# Common personal/free email domains to ignore
PERSONAL_DOMAINS = {
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'mail.ru', 
    'proton.me', 'protonmail.com', 'zoho.com', 'aol.com', 'mail.com', 'yandex.com', 'gmx.com'
}

def clean_emails(attendees_str):
    if not attendees_str:
        return []
    return [email.strip().lower() for email in attendees_str.split(',') if '@' in email]

def infer_company_and_domain(title, description, attendees_str):
    """
    Infers the company name and domain using Gemini 1.5 Flash.
    Fails gracefully if the API is not configured or fails.
    """
    emails = clean_emails(attendees_str)
    
    # Simple fallback heuristic before calling Gemini
    heuristic_domain = None
    heuristic_company = None
    
    # Try to find a non-personal email domain
    for email in emails:
        parts = email.split('@')
        if len(parts) == 2:
            dom = parts[1].strip()
            if dom not in PERSONAL_DOMAINS:
                heuristic_domain = dom
                heuristic_company = dom.split('.')[0].capitalize()
                break

    # If Gemini is not configured, return the heuristic directly
    if not api_key:
        print("GEMINI_API_KEY not set. Using local heuristics.")
        return heuristic_company, heuristic_domain
        
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        prompt = f"""
        You are an assistant for a sales meeting intelligence agent.
        Analyze the following calendar event details and infer the external target company name and company domain.
        
        Calendar Event Details:
        - Title: {title}
        - Description: {description}
        - Attendee Emails: {", ".join(emails)}
        
        Instructions:
        1. Identify the external company involved in this meeting.
        2. Look for attendee emails that don't belong to personal domains (e.g. ignore gmail.com, yahoo.com, outlook.com, etc.).
        3. If Sarah's email is sarah@acme.com, infer Acme as the company.
        4. Infer the domain (e.g. stripe.com, growthsignal.io) and company name.
        5. If the meeting is purely internal or personal, or if a company cannot be determined (e.g. only personal emails like ravi@gmail.com and no company details in the title), set both values to null.
        
        Return a JSON object exactly matching this structure:
        {{
          "company_name": "Company Name or null",
          "domain": "domain.com or null"
        }}
        """
        
        response = model.generate_content(
            prompt, 
            generation_config={"response_mime_type": "application/json"}
        )
        
        data = json.loads(response.text.strip())
        return data.get("company_name"), data.get("domain")
        
    except Exception as e:
        print(f"Error calling Gemini in infer_company_and_domain: {e}")
        # Return heuristic fallback
        return heuristic_company, heuristic_domain

def scrape_website(domain):
    """
    Scrapes the target company's landing page (Source 1)
    to collect descriptions, headings, and identify tech stacks/tools.
    """
    if not domain:
        return None
        
    # Standardize url
    url = domain.strip().lower()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = f"https://{url}"
        
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        r = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
    except Exception as e:
        print(f"Scraper HTTPS failed for {domain}, trying HTTP: {e}")
        try:
            url = f"http://{domain.strip().lower()}"
            r = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
        except Exception as e2:
            print(f"Scraper HTTP failed for {domain} as well: {e2}")
            return None
            
    if r.status_code != 200:
        print(f"Scraper returned status code {r.status_code} for {domain}")
        return None
        
    try:
        soup = BeautifulSoup(r.text, 'html.parser')
        
        title = soup.title.string.strip() if soup.title else ""
        
        # Meta description
        meta_desc = ""
        desc_tag = soup.find('meta', attrs={'name': 'description'}) or soup.find('meta', attrs={'property': 'og:description'})
        if desc_tag:
            meta_desc = desc_tag.get('content', '').strip()
            
        # Detect Tech Stack script signatures
        html_lower = r.text.lower()
        tech_signatures = {
            "React": ["react", "_next", "__next", "gatsby"],
            "Next.js": ["_next/static", "__next"],
            "Vue": ["vue.js", "vuejs"],
            "WordPress": ["wp-content", "wp-includes"],
            "Webflow": ["webflow.js", "data-wf-page"],
            "Shopify": ["shopify.cdn", "shopify.com"],
            "HubSpot": ["js.hs-scripts.com", "hubspot.com"],
            "Segment": ["cdn.segment.com/analytics.js/v1"],
            "Google Analytics": ["google-analytics.com", "gtag", "ga("],
            "Google Tag Manager": ["googletagmanager.com/gtm.js"],
            "Hotjar": ["static.hotjar.com"],
            "Intercom": ["widget.intercom.io"],
            "Stripe": ["js.stripe.com"],
            "Sentry": ["sentry.io", "browser.sentry-cdn.com"],
            "Mixpanel": ["api.mixpanel.com"],
            "Amplitude": ["amplitude.com"],
            "Drift": ["drift.com", "driftapi.com"],
            "Marketo": ["marketo.com", "munchkin.js"],
            "Salesforce": ["salesforce.com", "force.com"],
            "Tailwind CSS": ["tailwind"],
            "Vercel": ["vercel.app", "x-vercel-cache"],
            "Netlify": ["netlify"]
        }
        
        server_header = r.headers.get("Server", "").lower()
        via_header = r.headers.get("Via", "").lower()
        x_powered = r.headers.get("X-Powered-By", "").lower()
        
        detected_tech = []
        for tech, sigs in tech_signatures.items():
            for sig in sigs:
                if sig in html_lower or sig in server_header or sig in via_header or sig in x_powered:
                    detected_tech.append(tech)
                    break
                    
        # Extract top headings
        headings = [h.get_text(strip=True) for h in soup.find_all(['h1', 'h2'])[:8] if h.get_text(strip=True)]
        
        # Extract paragraph snippets
        paragraphs = []
        for p in soup.find_all('p')[:5]:
            p_text = p.get_text(strip=True)
            if p_text and len(p_text) > 30:
                paragraphs.append(p_text)
        body_snippet = "\n".join(paragraphs)[:1500]
        
        return {
            "title": title,
            "description": meta_desc,
            "detected_tech": list(set(detected_tech)),
            "headings": headings,
            "body_snippet": body_snippet
        }
    except Exception as e:
        print(f"Error parsing HTML for {domain}: {e}")
        return None

def search_tavily(query):
    """
    Search Tavily (Source 2 Option A)
    """
    tavily_key = os.environ.get("TAVILY_API_KEY")
    if not tavily_key:
        return None
    try:
        r = requests.post(
            "https://api.tavily.com/search",
            json={"api_key": tavily_key, "query": query, "search_depth": "news", "max_results": 5},
            timeout=10
        )
        if r.status_code == 200:
            data = r.json()
            return [
                {
                    "title": result.get("title", ""),
                    "link": result.get("url", ""),
                    "snippet": result.get("content", "")
                }
                for result in data.get("results", [])
            ]
    except Exception as e:
        print(f"Tavily search failed: {e}")
    return None

def search_duckduckgo(query, max_results=5):
    """
    Scrapes DuckDuckGo HTML search results (Source 2 Option B - Free & Keyless fallback)
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        encoded_query = urllib.parse.quote(query)
        url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
        
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code != 200:
            return []
            
        soup = BeautifulSoup(r.text, 'html.parser')
        results = []
        
        bodies = soup.find_all('div', class_='result__body')
        for body in bodies[:max_results]:
            title_el = body.find('a', class_='result__title')
            snippet_el = body.find('a', class_='result__snippet')
            
            if title_el:
                title = title_el.get_text(strip=True)
                link = title_el['href']
                snippet = snippet_el.get_text(strip=True) if snippet_el else ""
                
                # Clean links redirects from DDG
                if link.startswith('//duckduckgo.com/y.js'):
                    # Parse real link from DDG redirect url parameters
                    parsed_url = urllib.parse.urlparse(link)
                    query_params = urllib.parse.parse_qs(parsed_url.query)
                    if 'uddg' in query_params:
                        link = query_params['uddg'][0]
                        
                results.append({
                    "title": title,
                    "link": link,
                    "snippet": snippet
                })
        return results
    except Exception as e:
        print(f"DuckDuckGo search failed: {e}")
        return []

def search_news_and_funding(company_name, domain):
    """
    Queries external search engines to get recent updates/launches/funding (Source 2).
    """
    query = f"{company_name} recent news funding launch \"{domain}\""
    
    # Try Tavily first if API key is provided
    tavily_results = search_tavily(query)
    if tavily_results:
        print(f"Fetched news from Tavily for {company_name}")
        return tavily_results
        
    # Fallback to keyless DuckDuckGo search
    print(f"Fetched news from DuckDuckGo fallback for {company_name}")
    return search_duckduckgo(query, max_results=4)

def run_research_pipeline(meeting_id):
    """
    Runs the full background research pipeline for a meeting.
    Saves the final brief to the database.
    """
    meeting = db.get_meeting(meeting_id)
    if not meeting:
        return
        
    db.update_meeting_status(meeting_id, 'researching')
    
    try:
        # Step 1: Infer Company & Domain
        company_name, domain = infer_company_and_domain(
            meeting['title'], 
            meeting['description'] or '', 
            meeting['attendees'] or ''
        )
        
        # If company name or domain couldn't be inferred
        if not company_name or not domain:
            db.update_meeting_status(meeting_id, 'unidentified')
            return
            
        db.update_meeting_status(meeting_id, 'researching', company_name, domain)
        
        # Step 2: Scrape Company Website (Source 1)
        scraper_data = scrape_website(domain)
        
        # Step 3: Fetch News Search (Source 2)
        news_data = search_news_and_funding(company_name, domain)
        
        # Format the fetched information for Gemini synthesis
        scraper_info = ""
        if scraper_data:
            scraper_info = f"""
            Website Scraped Details:
            - Title: {scraper_data.get('title')}
            - Meta Description: {scraper_data.get('description')}
            - Identified Tech Stack Signals: {', '.join(scraper_data.get('detected_tech', []))}
            - Homepage Headings: {', '.join(scraper_data.get('headings', []))}
            - Website Body Snippet: {scraper_data.get('body_snippet')}
            """
        else:
            scraper_info = "Website homepage could not be successfully crawled/scraped."
            
        news_info = "Recent News/Funding Web Search Results:\n"
        if news_data:
            for item in news_data:
                news_info += f"- Title: {item.get('title')}\n  Snippet: {item.get('snippet')}\n  URL: {item.get('link')}\n"
        else:
            news_info += "No recent news search results found."
            
        # Step 4: Synthesize Intelligence Brief using Gemini 1.5 Flash
        if not api_key:
            # Simple fallback brief if Gemini key is missing
            db.save_brief(
                meeting_id=meeting_id,
                company_description=scraper_data.get('description') if scraper_data else f"A company operating at {domain}.",
                news="No Gemini API Key set to query recent news summaries.",
                tech_signals="- Heuristics: " + (", ".join(scraper_data.get('detected_tech', [])) if scraper_data else "None detected"),
                pain_points="- Unknown (requires Gemini API Key for deep analysis)",
                talking_points=["How are you thinking about growth?", "What is your main priority for the next few quarters?"]
            )
            db.update_meeting_status(meeting_id, 'done')
            return
            
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        synthesis_prompt = f"""
        You are a highly skilled Sales Intelligence Agent.
        Your goal is to synthesize a meeting brief using live scraped data and search results.
        Do not use corporate marketing buzzwords. Summarize everything in plain, direct language.
        
        Company Name: {company_name}
        Domain: {domain}
        
        {scraper_info}
        
        {news_info}
        
        Please synthesize this into a structured JSON intelligence brief.
        The JSON must contain exactly these 5 keys:
        1. "company_description": Explain in plain language what the company does (avoid marketing copy). Include their stage/size if detectable.
        2. "recent_news": Summary of news, announcements, product launches, funding, or hiring from the last 60-90 days based on search results. Use markdown bullet points. If no search news is available, synthesize what you can or state that none was found.
        3. "tech_signals": Modern description of their tech stack, tools, or libraries (e.g. React, HubSpot, Vercel, Segment). Mix the scraped tech signals with smart inferences. Use markdown bullet points.
        4. "pain_points": Inferred pain points they are likely facing based on their public activity, tech signals, news, and stage. Use markdown bullet points.
        5. "talking_points": List of exactly 2-3 specific, relevant, and engaging talking points for a sales rep or account manager to bring up in the meeting. Do not make them generic. Return them as a list of strings.
        
        Ensure your output is valid JSON.
        """
        
        response = model.generate_content(
            synthesis_prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        
        brief_data = json.loads(response.text.strip())
        
        db.save_brief(
            meeting_id=meeting_id,
            company_description=brief_data.get("company_description", "No company description synthesized."),
            news=brief_data.get("recent_news", "No recent news found."),
            tech_signals=brief_data.get("tech_signals", "No tech signals detected."),
            pain_points=brief_data.get("pain_points", "No pain points inferred."),
            talking_points=brief_data.get("talking_points", ["How are they thinking about growth?"])
        )
        
        db.update_meeting_status(meeting_id, 'done')
        print(f"Successfully completed research pipeline for meeting {meeting_id} ({company_name})")
        
    except Exception as e:
        print(f"Error in research pipeline for meeting {meeting_id}: {e}")
        db.update_meeting_status(meeting_id, 'failed')
