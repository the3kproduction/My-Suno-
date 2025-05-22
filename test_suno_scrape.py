import trafilatura
import requests
import json

def test_suno_profile_access():
    """Test accessing the Suno profile to understand the data structure"""
    
    profile_url = "https://suno.com/@3kloudz"
    
    print(f"Testing access to: {profile_url}")
    
    # Try to get the page content
    try:
        response = requests.get(profile_url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        print(f"Status code: {response.status_code}")
        
        if response.status_code == 200:
            # Try to extract text content
            text_content = trafilatura.extract(response.text)
            if text_content:
                print("Successfully extracted text content")
                print(f"Content length: {len(text_content)}")
                print("First 500 characters:")
                print(text_content[:500])
            
            # Look for JSON data in the page
            if '"songs"' in response.text or '"tracks"' in response.text:
                print("\nFound potential song data in page!")
                
            # Look for API endpoints in the page source
            if 'api' in response.text.lower():
                print("Found potential API references")
                
        else:
            print(f"Failed to access page: {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_suno_profile_access()