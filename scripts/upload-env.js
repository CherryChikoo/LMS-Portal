const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const envLocal = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const lines = envLocal.split('\n');

for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const splitIndex = trimmed.indexOf('=');
    const key = trimmed.substring(0, splitIndex);
    const value = trimmed.substring(splitIndex + 1);
    
    // Skip if it's already in Vercel or we want to overwrite
    console.log(`Adding ${key}...`);
    try {
      cp.execSync(`npx vercel env rm ${key} production --yes`, { stdio: 'ignore' });
    } catch(e) {} // ignore if it doesn't exist

    // Add it
    try {
      cp.execSync(`npx vercel env add ${key} production`, {
        input: value + '\n',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      console.log(`Successfully added ${key}`);
    } catch(e) {
      console.error(`Failed to add ${key}:`, e.message);
    }
  }
}
