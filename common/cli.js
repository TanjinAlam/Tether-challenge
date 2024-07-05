const rl = require("readline");
let readline;

class CLI {
  constructor() {}

  async askTerminal(question) {
    if (!readline) {
      readline = rl.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    }
    return new Promise((resolve) => {
      readline.question(question, (input) => resolve(input));
    });
  }
}

module.exports = { CLI };
