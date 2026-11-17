import {cleanEnv, num, str} from "envalid";
import process from "node:process";
import dotenv from "dotenv";
dotenv.config();

export const env = cleanEnv(process.env, {
  PORT: num({
    default: 3511, // Gitea connector port
    desc: "Port number to run app",
  }),
  LOG_LEVEL: str({
    default: "debug",
    choices: ["debug", "info", "warn", "error", "none"],
  }),
  NODE_ENV: str({
    default: "development",
    choices: ["development", "test", "production"],
  }),
  WAIT_BEFORE_SERVER_CLOSE: num({default: 0}),
  PAGE_SIZE: num({default: 50}),
  MAX_CONCURRENT_CONNECTIONS: num({default: 10}),
  REQUEST_TIMEOUT_MS: num({
    default: 30000,
    desc: "Abort a Gitea API request that has not completed after this many milliseconds",
  }),
  ALLOWED_GITEA_HOSTS: str({
    default: "",
    desc: "Comma-separated Gitea hosts (host or host:port) this connector may call. Empty allows any host.",
  }),
  API_VERSION: num({default: 1}),
  WEBHOOK_SECRET: str({
    default: "",
    desc: "Shared secret Gitea sends in the webhook Authorization header (or signs the body with). Empty disables verification.",
  }),
});
