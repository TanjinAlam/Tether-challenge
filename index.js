const { Client } = require("./client");
const { CLI } = require("./common/cli");
const { Server, createRPCserver } = require("./server");

async function main() {
  try {
    if (process.argv[2] == "server") {
      const server = new Server(process.argv[2]);
    } else if (process.argv[2] != "server") {
      const cli = new CLI();
      const nickname = await cli.askTerminal("What is your nickname? ");
      const userName = nickname.toLowerCase();
      const client = new Client(userName);
    }
  } catch (er) {
    console.log("Make sure you are following readme");
  }
}

main();
