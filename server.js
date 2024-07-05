const Hyperswarm = require("hyperswarm");
const Hypercore = require("hypercore");
const Hyperbee = require("hyperbee");
const crypto = require("crypto");
const { CLI } = require("./common/cli");

class Server {
  constructor() {
    this.server = new Hyperswarm();
    this.cli = new CLI();
    this.players = new Map();
    this.clients = [];
    this.auctionCounter = 0;

    // Initialize Hypercore and Hyperbee
    const core = new Hypercore(
      `./my-auction-feed-${crypto.randomBytes(4).toString("hex")}`
    );

    this.db = new Hyperbee(core, {
      keyEncoding: "utf-8",
      valueEncoding: "json",
    });

    const topic = Buffer.alloc(32).fill("p2p-auction");

    this.server.join(topic, {
      server: true,
      client: false,
    });
    this.handleConnection = this.handleConnection.bind(this);
    this.server.on("connection", this.handleConnection);
    console.log("Server is running....");
  }

  async handleConnection(socket, peerInfo) {
    try {
      console.log("New user joined");
      const publicKey = peerInfo.publicKey.toString("hex");
      console.log("publicKey", publicKey);
      socket.write(
        JSON.stringify({
          type: "sync-pub-key",
          publicKey: publicKey,
        })
      );
      if (!this.players.has(publicKey)) {
        this.players.set(publicKey, { socket });
        this.clients.push(socket);
      }

      socket.on("data", async (data) => {
        try {
          const jsonData = JSON.parse(data.toString());
          if (jsonData.type === "make-auction") {
            await this.createAuction(
              publicKey,
              jsonData.msg,
              jsonData.nickname
            );
          } else if (jsonData.type === "bid-auction") {
            await this.placeBid(
              jsonData.msg,
              jsonData.nickname,
              jsonData.publicKey
            );
          } else if (jsonData.type === "get-auction-table") {
            await this.sendAuctionTable(socket);
          } else if (jsonData.type === "close-auction") {
            await this.closeAuction(publicKey, jsonData.nickname);
          }
        } catch (error) {
          console.error("Error handling data event:", error);
        }
      });
    } catch (error) {
      console.error("Error in handleConnection:", error);
    }
  }

  async createAuction(publicKey, message, user) {
    try {
      const { picture, price } = JSON.parse(`{${message}}`);
      const auctionId = this.auctionCounter++;
      const auction = {
        auctionId,
        picture,
        price,
        bids: [],
        ownerPublicKey: publicKey,
      };

      // Save to Hyperbee
      await this.db.put(`auction:${auctionId}`, auction);

      const msg = `Auction created by ${user} ID ${auctionId}, Picture: ${picture}, Starting Price: ${price} USDt`;
      this.respondToClients(msg, "notify-all-user");
    } catch (error) {
      console.error("Error in createAuction:", error);
    }
  }

  async placeBid(message, user, bidderPublicKey) {
    try {
      const { auctionId, price } = JSON.parse(`{${message}}`);

      // Retrieve auction from Hyperbee
      const auctionEntry = await this.db.get(`auction:${auctionId}`);
      const auction = auctionEntry.value;

      if (auction) {
        if (auction.ownerPublicKey === bidderPublicKey) {
          const msg = `Owner cannot bid on their own auction.`;
          this.respondToClients(msg, "notify-all-user");
        } else {
          auction.bids.push({ bidder: bidderPublicKey, price });

          // Update auction in Hyperbee
          await this.db.put(`auction:${auctionId}`, auction);

          const msg = `Bid placed on Auction by ${user} ${price} USDt`;
          this.respondToClients(msg, "notify-all-user");
        }
      } else {
        const msg = `Auction ID ${auctionId} does not exist.`;
        this.respondToClients(msg, "notify-all-user");
      }
    } catch (error) {
      console.error("Error in placeBid:", error);
    }
  }

  async sendAuctionTable(socket) {
    try {
      const auctionTable = [];
      const stream = this.db.createReadStream({
        gte: "auction:",
        lt: "auction;",
      });

      for await (const { key, value } of stream) {
        auctionTable.push(value);
      }

      socket.write(
        JSON.stringify({
          type: "auction-table",
          msg: auctionTable,
        })
      );
    } catch (error) {
      console.error("Error in sendAuctionTable:", error);
    }
  }

  async closeAuction(publicKey, user) {
    try {
      const stream = this.db.createReadStream({
        gte: "auction:",
        lt: "auction;",
      });

      for await (const { key, value } of stream) {
        if (value.ownerPublicKey === publicKey) {
          const highestBid = Math.max(
            ...value.bids.map((bid) => bid.price),
            -Infinity
          );
          const picture = value.picture;
          if (highestBid === -Infinity) {
            const msg = `Auction closed by ${user}, where no bids have been placed yet.`;
            this.respondToClients(msg, "notify-all-user");
          } else {
            const msg = `Auction closed by ${user} Auction ID ${value.auctionId}, Highest bid is ${highestBid} USDt for ${picture}`;
            this.respondToClients(msg, "notify-all-user");
          }

          // Delete auction from Hyperbee
          await this.db.del(key);
        }
      }
    } catch (error) {
      console.error("Error in closeAuction:", error);
    }
  }

  respondToClients(message, type) {
    try {
      if (type == "notify-all-user") {
        for (const client of this.clients) {
          client.write(
            JSON.stringify({
              type: "auction-update",
              msg: message,
            })
          );
        }
      }
    } catch (error) {
      console.error("Error in respondToClients:", error);
    }
  }
}

module.exports = { Server };
