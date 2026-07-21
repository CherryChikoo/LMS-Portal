const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      if (dirPath.endsWith('.tsx') || dirPath.endsWith('.ts')) {
        callback(dirPath);
      }
    }
  });
}

walkDir('src/app', (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const regexOption = /<option\s+key=\{([a-zA-Z0-9_?.]+)\}\s+value=\{([a-zA-Z0-9_?.]+)\}>\s*\{([a-zA-Z0-9_?.]+)\}\s*<\/option>/g;
  content = content.replace(regexOption, (match, key, val, name) => {
    if (name.includes('name')) {
      return `<option key={${key}} value={${val}}>{${name} || "Unnamed College"}</option>`;
    }
    return match;
  });

  if (content !== fs.readFileSync(filePath, 'utf8')) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
});

console.log('Fixed options');
