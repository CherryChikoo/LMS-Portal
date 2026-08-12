const fs = require('fs');
let content = fs.readFileSync('firestore.rules', 'utf8');
content = content.replace(/resource\.data\.collegeId/g, "resource.data.get('collegeId', '')");
// also fix request.resource
content = content.replace(/request\.resource\.data\.get\('collegeId', ''\)/g, "request.resource.data.get('collegeId', '')");
fs.writeFileSync('firestore.rules', content);
console.log('Done');
