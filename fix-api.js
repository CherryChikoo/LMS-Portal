const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;

      // Fix catch (any)
      if (/catch\s*\(\s*([a-zA-Z0-9_]+)\s*:\s*any\s*\)/.test(content)) {
        content = content.replace(/catch\s*\(\s*([a-zA-Z0-9_]+)\s*:\s*any\s*\)/g, 'catch ($1: unknown)');
        modified = true;
      }

      // Fix .message access on unknown
      if (modified || /catch\s*\(\s*[a-zA-Z0-9_]+\s*:\s*unknown\s*\)/.test(content)) {
        // Find catch block variables
        const matches = content.matchAll(/catch\s*\(\s*([a-zA-Z0-9_]+)\s*:\s*unknown\s*\)/g);
        for (const match of matches) {
          const v = match[1];
          // Replace v.message with (v as Error).message
          const msgRegex = new RegExp(`\\b${v}\\.message\\b`, 'g');
          if (msgRegex.test(content)) {
            content = content.replace(msgRegex, `(${v} as Error).message`);
            modified = true;
          }
          // Replace v.code with (v as any).code
          const codeRegex = new RegExp(`\\b${v}\\.code\\b`, 'g');
          if (codeRegex.test(content)) {
            content = content.replace(codeRegex, `(${v} as any).code`);
            modified = true;
          }
          const stackRegex = new RegExp(`\\b${v}\\.stack\\b`, 'g');
          if (stackRegex.test(content)) {
            content = content.replace(stackRegex, `(${v} as Error).stack`);
            modified = true;
          }
          const resRegex = new RegExp(`\\b${v}\\.response\\.data\\b`, 'g');
          if (resRegex.test(content)) {
            content = content.replace(resRegex, `(${v} as any).response?.data`);
            modified = true;
          }
        }
      }

      if (modified) {
        fs.writeFileSync(fullPath, content);
        console.log('Fixed', fullPath);
      }
    }
  }
}

processDir(path.join(__dirname, 'src', 'app', 'api'));
processDir(path.join(__dirname, 'src', 'lib', 'server'));
processDir(path.join(__dirname, 'src', 'lib', 'firebase'));
