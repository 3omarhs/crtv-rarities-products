import urllib.request
import urllib.error
import json

def list_models():
    keys = []
    try:
        with open('geminiCredentials.txt', 'r') as f:
            for line in f:
                if 'Gemini API Key:' in line:
                    keys.append(line.split('Gemini API Key:')[1].strip())
    except Exception as e:
        print(f"Error: {e}")
        return

    if not keys: return

    key = keys[0] # Test with first key
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
    
    print(f"Listing FLASH models with key: {key[:5]}...")
    try:
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode('utf-8'))
            for m in data.get('models', []):
                if 'flash' in m['name'].lower() and 'generateContent' in m.get('supportedGenerationMethods', []):
                    print(f"- {m['name']}")
    except urllib.error.HTTPError as e:
        print(f"Failed. Status: {e.code} - {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_models()
