const rcedit = require('rcedit');
const path = require('path');

const exePath = path.join(__dirname, 'TimezoneServer.exe');
const iconPath = path.join(__dirname, 'timezone-icon.ico');

console.log('Setting icon for TimezoneServer.exe...');
console.log(`EXE: ${exePath}`);
console.log(`Icon: ${iconPath}`);

rcedit(exePath, {
    icon: iconPath
}, (err) => {
    if (err) {
        console.error('❌ Failed to set icon:', err);
        process.exit(1);
    }
    console.log('✅ Icon set successfully!');
});
