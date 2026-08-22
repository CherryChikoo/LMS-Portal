const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:\\Users\\cherr\\.gemini\\antigravity-ide\\brain\\73f1c31f-b4b8-41ce-b6b5-80306051d6f5\\.system_generated\\logs\\transcript_full.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let foundContent = "";
  for await (const line of rl) {
    if (line.includes("export default function ResultsPage() {") && line.includes("getPaginatedResultsAction")) {
      console.log("Found line of length: ", line.length);
      try {
        const obj = JSON.parse(line);
        if (obj.tool_calls) {
          for (const tc of obj.tool_calls) {
            if (tc.name === "write_to_file" && tc.args.TargetFile.includes("results/page.tsx")) {
              fs.writeFileSync("found_page.txt", tc.args.CodeContent, 'utf8');
              console.log("Saved to found_page.txt");
              return;
            } else if (tc.name === "run_command" && tc.args.CommandLine.includes("results/page.tsx")) {
              fs.writeFileSync("found_page.txt", tc.args.CommandLine, 'utf8');
              console.log("Saved to found_page.txt (command)");
              return;
            }
          }
        }
      } catch (e) {
        console.error("Error parsing", e.message);
      }
    }
  }
}

processLineByLine();
