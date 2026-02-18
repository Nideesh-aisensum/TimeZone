const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

async function createSquareIcon() {
    const inputPath = path.join(__dirname, 'page-1', 'timezone-branding.png');
    const outputPath = path.join(__dirname, 'timezone-icon-square.png');
    
    const img = await loadImage(inputPath);
    const size = Math.max(img.width, img.height);
    
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Fill with transparent background
    ctx.clearRect(0, 0, size, size);
    
    // Center the image
    const x = (size - img.width) / 2;
    const y = (size - img.height) / 2;
    ctx.drawImage(img, x, y);
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    console.log(`Created square icon: ${outputPath}`);
}

createSquareIcon().catch(console.error);
