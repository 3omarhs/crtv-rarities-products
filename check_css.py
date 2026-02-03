import re

def check_braces(file_path):
    print(f"Checking {file_path}...")
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    stack = []
    
    # Simple state machine to ignore comments
    in_comment = False
    
    for i, line in enumerate(lines):
        # We process char by char to handle comments correctly
        j = 0
        while j < len(line):
            # Check for comment start
            if not in_comment and line[j:j+2] == '/*':
                in_comment = True
                j += 2
                continue
            
            # Check for comment end
            if in_comment and line[j:j+2] == '*/':
                in_comment = False
                j += 2
                continue
            
            if in_comment:
                j += 1
                continue
            
            char = line[j]
            if char == '{':
                stack.append({'line': i + 1, 'col': j + 1})
            elif char == '}':
                if not stack:
                    print(f"ERROR: Unexpected closing brace at line {i + 1}, col {j + 1}")
                    return
                stack.pop()
            j += 1
            
    if stack:
        print(f"ERROR: Unclosed brace started at line {stack[0]['line']}, col {stack[0]['col']}")
        # Print context
        start = max(0, stack[0]['line'] - 6)
        end = min(len(lines), stack[0]['line'] + 5)
        print("Context:")
        for k in range(start, end):
            print(f"{k+1}: {lines[k].rstrip()}")
    elif in_comment:
        print("ERROR: File ends with an unclosed comment!")
    else:
        print("SUCCESS: Braces seem balanced.")

check_braces('style.css')
check_braces('chatbot-styles.css')
