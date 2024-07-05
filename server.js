const Hyperswarm = require("hyperswarm");
const { CLI } = require("./common/cli");

class Server {
  constructor() {
    this.server = new Hyperswarm();
    this.cli = new CLI();
    this.players = new Map();
    this.clients = [];
    this.auctions = new Map();
    this.auctionCounter = 0;
    const topic = Buffer.alloc(32).fill("p2p-auction");

    this.server.join(topic, {
      server: true,
      client: false,
    });
    this.handleConnection = this.handleConnection.bind(this);
    this.server.on("connection", this.handleConnection);
    console.log("Server is running....");
  }

  handleConnection(socket, peerInfo) {
    try {
      console.log("New user joined");
      const publicKey = peerInfo.publicKey.toString("hex");
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

      socket.on("data", (data) => {
        try {
          const jsonData = JSON.parse(data.toString());
          if (jsonData.type === "make-auction") {
            this.createAuction(publicKey, jsonData.msg, jsonData.nickname);
          } else if (jsonData.type === "bid-auction") {
            this.placeBid(jsonData.msg, jsonData.nickname, jsonData.publicKey);
          } else if (jsonData.type === "get-auction-table") {
            this.sendAuctionTable(socket);
          } else if (jsonData.type === "close-auction") {
            this.closeAuction(publicKey, jsonData.nickname);
          }
        } catch (error) {
          console.error("Error handling data event:", error);
        }
      });
    } catch (error) {
      console.error("Error in handleConnection:", error);
    }
  }

  createAuction(publicKey, message, user) {
    try {
      const { picture, price } = JSON.parse(`{${message}}`);
      const auctionId = this.auctionCounter++;
      if (!this.auctions.has(publicKey)) {
        this.auctions.set(publicKey, []);
      }
      this.auctions
        .get(publicKey)
        .push({ auctionId, picture, price, bids: [] });
      const msg = `Auction created by ${user} ID ${auctionId}, Picture: ${picture}, Starting Price: ${price} USDt`;
      this.respondToClients(msg, "notify-all-user");
    } catch (error) {
      console.error("Error in createAuction:", error);
    }
  }

  placeBid(message, user, bidderPublicKey) {
    try {
      const { auctionId, price } = JSON.parse(`{${message}}`);
      const auctionOwnerPublicKey = this.findPublicKeyByAuctionId(auctionId);
      if (auctionOwnerPublicKey && this.auctions.has(auctionOwnerPublicKey)) {
        if (auctionOwnerPublicKey == bidderPublicKey) {
          const msg = `Owner cannot bid on their own auction.`;
          this.respondToClients(msg, "notify-all-user");
        } else {
          const auction = this.auctions
            .get(auctionOwnerPublicKey)
            .find((a) => a.auctionId === auctionId);

          auction.bids.push(price);
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

  findPublicKeyByAuctionId(auctionId) {
    for (const [publicKey, auctions] of this.auctions.entries()) {
      if (auctions.some((a) => a.auctionId === auctionId)) {
        return publicKey;
      }
    }
    return null;
  }

  sendAuctionTable(socket) {
    try {
      const auctionTable = [];
      this.auctions.forEach((auctions, publicKey) => {
        auctions.forEach((a) => {
          auctionTable.push({
            auctionId: a.auctionId,
            publicKey,
            picture: a.picture,
            price: a.price,
            bids: a.bids,
          });
        });
      });
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

  closeAuction(publicKey, user) {
    try {
      if (this.auctions.has(publicKey)) {
        const auctions = this.auctions.get(publicKey);
        auctions.forEach((auction) => {
          const highestBid = Math.max(...auction.bids);
          const picture = auction.picture;
          if (highestBid === -Infinity) {
            const msg = `Auction closed by ${user}, where no bids have been placed yet.`;
            this.respondToClients(msg, "notify-all-user");
          } else {
            const msg = `Auction closed by ${user} Auction ID ${auction.auctionId}, Highest bid is ${highestBid} USDt for ${picture}`;
            this.respondToClients(msg, "notify-all-user");
          }
        });
        this.auctions.delete(publicKey);
      } else {
        const msg = `No auctions found for ${user}.`;
        this.respondToClients(msg, "notify-all-user");
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
