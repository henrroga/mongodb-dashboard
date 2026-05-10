const pino = require("pino");
const config = require("../config");

const logger = pino({
  level: process.env.LOG_LEVEL || (config.nodeEnv === "development" ? "debug" : "info"),
  transport: config.nodeEnv === "development"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

module.exports = logger;
