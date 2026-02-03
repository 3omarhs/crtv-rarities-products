const fs = require('fs');

function checkBraces(filePath) {
    console.log(`Checking ${filePath}...`);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let stack = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Simple parser ignoring comments/strings for speed (approximate but usually enough for brace errors)
        // A more robust one would strip comments first.

        let cleanedLine = line.replace(/\/\*[\s\S]*?\*\//g, ''); // Inline comments
        // Note: Multi-line comments might spanning lines, this simple check might fail false positive but helpful.

        for (let j = 0; j < cleanedLine.length; j++) {
            const char = cleanedLine[j];
            if (char === '{') {
                stack.push({ line: i + 1, col: j + 1 });
            } else if (char === '}') {
                if (stack.length === 0) {
                    console.error(`ERROR: Unexpected closing brace at line ${i + 1}, col ${j + 1}`);
                    return;
                }
                stack.pop();
            }
        }
    }

    if (stack.length > 0) {
        console.error(`ERROR: Unclosed brace started at line ${stack[0].line}, col ${stack[0].col}`);
        // print context
        console.log("Context:");
        const start = Math.max(0, stack[0].line - 5);
        const end = Math.min(lines.length, stack[0].line + 5);
        for (let k = start; k < end; k++) {
            console.log(`${k + 1}: ${lines[k]}`);
        }
    } else {
        console.log("SUCCESS: Braces seem balanced.");
    }
}

checkBraces('style.css');
checkBraces('chatbot-styles.css');
