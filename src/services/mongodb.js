const { MongoClient } = require("mongodb");

class MongoDBService {
  constructor() {
    this.client = null;
    this.connectionString = null;
  }

  async connect(connectionString) {
    // If already connected to same string, reuse
    if (this.client && this.connectionString === connectionString) {
      return this.client;
    }

    // Disconnect existing connection
    if (this.client) {
      await this.disconnect();
    }

    // Create new connection with optimized settings
    this.client = new MongoClient(connectionString, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
    });

    await this.client.connect();
    this.connectionString = connectionString;

    console.log("Connected to MongoDB");
    return this.client;
  }

  getClient() {
    return this.client;
  }

  isConnected() {
    return this.client !== null;
  }

  getConnectionString() {
    return this.connectionString;
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.connectionString = null;
      console.log("Disconnected from MongoDB");
    }
  }
}

// Singleton instance
module.exports = new MongoDBService();
