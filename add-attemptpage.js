const fs = require('fs');
const targetFile = 'src/app/(dashboard)/results/page.tsx';
let content = fs.readFileSync(targetFile, 'utf8');

if (!content.includes('const [attemptPage, setAttemptPage] = useState(1);')) {
  content = content.replace(
    'const [attempts, setAttempts] = useState<any[]>([]);',
    'const [attempts, setAttempts] = useState<any[]>([]);\n  const [attemptPage, setAttemptPage] = useState(1);'
  );
  fs.writeFileSync(targetFile, content, 'utf8');
  console.log("Added attemptPage state");
} else {
  console.log("attemptPage state already exists");
}
