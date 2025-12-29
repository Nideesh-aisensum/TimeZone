/**
 * Installation Script - Add shell-connector.js to all HTML files
 * 
 * Run this in PowerShell from the page-1 directory:
 * node add-shell-connector.js
 */

const fs = require('fs');
const path = require('path');

const dir = __dirname;

// Get all HTML files
const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html') && !f.includes('kiosk-'));

console.log(`Found ${htmlFiles.length} HTML files to update:`);

htmlFiles.forEach(file => {
    const filepath = path.join(dir, file);
    let content = fs.readFileSync(filepath, 'utf8');

    // Skip if already has shell-connector
    if (content.includes('shell-connector.js')) {
        console.log(`[SKIP] ${file} - already has shell-connector`);
        return;
    }

    // Find first </head> or first <script> tag
    const insertPoints = [
        { regex: /(<script\s+src="[^"]*"[^>]*>\s*<\/script>)/, before: true },
        { regex: /(<\/head>)/, before: true }
    ];

    let inserted = false;

    for (const point of insertPoints) {
        const match = content.match(point.regex);
        if (match) {
            const insertPos = match.index;
            const script = '\n    <script src="shell-connector.js"></script>';

            if (point.before) {
                content = content.slice(0, insertPos) + script + '\n' + content.slice(insertPos);
            } else {
                content = content.slice(0, insertPos + match[0].length) + script + content.slice(insertPos + match[0].length);
            }

            inserted = true;
            break;
        }
    }

    if (inserted) {
        fs.writeFileSync(filepath, content, 'utf8');
        console.log(`[OK] ${file} - added shell-connector`);
    } else {
        console.log(`[WARN] ${file} - couldn't find insertion point`);
    }
});

console.log('\nDone! You can now open kiosk-shell.html to test.');
