const Hyperswarm = require("hyperswarm");
const { CLI } = require("./common/cli");

class Client {
  constructor(nickname) {
    this.nickname = nickname;
    this.client = new Hyperswarm();
    this.cli = new CLI();
    this.publicKey = "";
    this.topic = Buffer.alloc(32).fill("p2p-auction");
    this.client.join(this.topic, {
      server: false,
      client: true,
    });

    this.handleConnection = this.handleConnection.bind(this);
    this.client.on("connection", this.handleConnection);
  }

  handleConnection(socket) {
    this.connection = socket;
    socket.on("data", async (data) => {
      const jsonData = JSON.parse(data.toString());
      if (jsonData.type === "input-validation-error") {
        console.log(jsonData.msg);
      } else if (jsonData.type === "auction-table") {
        console.log(jsonData.msg);
      } else if (jsonData.type === "auction-update") {
        console.log(jsonData.msg);
      } else if (jsonData.type === "sync-pub-key") {
        this.publicKey = jsonData.publicKey;
      }
    });

    this.auctionOperation();
  }

  auctionBidInstruction() {
    console.log("press 1 to make auction");
    console.log("press 2 to bid auction");
    console.log("press 3 to see bidding table");
    console.log("press 4 to close auction");
  }

  clearScreen() {
    process.stdout.write("\x1B[2J\x1B[0f");
  }

  async auctionOperation() {
    while (true) {
      this.auctionBidInstruction();
      const number = await this.cli.askTerminal("> ");
      this.clearScreen();
      if (number == 1) {
        const userInput = await this.cli.askTerminal(
          "Enter picture name and price: "
        );
        // this.clearScreen();
        const [userInputPictureName, userInputPrice] = userInput.split(" ");
        const message = `"picture": "${userInputPictureName}", "price": ${userInputPrice}`;
        this.connection.write(
          JSON.stringify({
            type: "make-auction",
            msg: message,
            nickname: this.nickname,
          })
        );
      } else if (number == 2) {
        const userInput = await this.cli.askTerminal(
          "Enter auction ID and bid price: "
        );
        this.clearScreen();
        const [userInputAuctionId, userInputPrice] = userInput.split(" ");
        const message = `"auctionId": ${userInputAuctionId}, "price": ${userInputPrice}`;
        this.connection.write(
          JSON.stringify({
            type: "bid-auction",
            msg: message,
            nickname: this.nickname,
            publicKey: this.publicKey, // Include the bidder's public key
          })
        );
      } else if (number == 3) {
        this.clearScreen();
        this.connection.write(
          JSON.stringify({
            type: "get-auction-table",
            msg: "",
          })
        );
      } else if (number == 4) {
        this.clearScreen();
        this.connection.write(
          JSON.stringify({
            type: "close-auction",
            msg: "",
            nickname: this.nickname,
          })
        );
      } else {
        this.clearScreen();
        console.log("Invalid option. Please try again.");
      }
    }
  }
}

module.exports = { Client };
