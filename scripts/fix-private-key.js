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
    let value = trimmed.substring(splitIndex + 1);
    
    if (key === 'FIREBASE_ADMIN_PRIVATE_KEY') {
       // Remove quotes if present
       if (value.startsWith('"') && value.endsWith('"')) {
         value = value.substring(1, value.length - 1);
       } else if (value.startsWith("'") && value.endsWith("'")) {
         value = value.substring(1, value.length - 1);
       }
       
       console.log(`Fixing and uploading ${key}...`);
       try {
         cp.execSync(`npx vercel env rm ${key} production --yes`, { stdio: 'ignore' });
       } catch(e) {}
       
       try {
         cp.execSync(`npx vercel env add ${key} production`, {
           input: value,
           stdio: ['pipe', 'pipe', 'pipe']
         });
         console.log(`Successfully fixed ${key}`);
       } catch(e) {
         console.error(`Failed to add ${key}:`, e.message);
       }
    }
  }
}
