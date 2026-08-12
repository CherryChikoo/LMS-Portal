const fs = require('fs');
let content = fs.readFileSync('firestore.rules', 'utf8');

content = content.replace(/resource\.data\.email/g, "resource.data.get('email', '')");
content = content.replace(/resource\.data\.role/g, "resource.data.get('role', '')");
content = content.replace(/request\.resource\.data\.role/g, "request.resource.data.get('role', '')");
content = content.replace(/resource\.data\.status/g, "resource.data.get('status', '')");
content = content.replace(/resource\.data\.studentId/g, "resource.data.get('studentId', '')");
content = content.replace(/request\.resource\.data\.studentId/g, "request.resource.data.get('studentId', '')");
content = content.replace(/resource\.data\.studentEmail/g, "resource.data.get('studentEmail', '')");

fs.writeFileSync('firestore.rules', content);
console.log('Replaced all direct property accesses with safe .get()');
