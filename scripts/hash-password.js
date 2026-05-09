#!/usr/bin/env node
const bcrypt = require("bcryptjs");
const readline = require("readline");

function prompt(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    if (hidden) {
      const stdin = process.stdin;
      const onData = (char) => {
        char = char + "";
        if (char === "\n" || char === "\r" || char === "") {
          stdin.removeListener("data", onData);
        } else {
          process.stdout.write("\x1B[2K\x1B[200D" + question + "*".repeat(rl.line.length));
        }
      };
      stdin.on("data", onData);
    }
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

(async () => {
  const arg = process.argv[2];
  const password = arg || (await prompt("Password: ", { hidden: true }));
  if (!password) {
    console.error("No password provided.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Warning: passwords shorter than 8 characters are insecure.");
  }
  const hash = bcrypt.hashSync(password, 12);
  console.log("\nAdd this to your .env file:\n");
  console.log(`AUTH_PASSWORD_HASH='${hash}'`);
})();
