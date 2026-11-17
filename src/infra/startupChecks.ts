import {config} from "../config.js";

type CheckedConfig = Pick<typeof config, "nodeEnv" | "webhookSecret">;

/** Human-readable warnings about settings that are legal but risky for a production deployment. */
export const getConfigWarnings = (cfg: CheckedConfig = config): string[] => {
  const warnings: string[] = [];
  if (cfg.nodeEnv === "production" && !cfg.webhookSecret) {
    warnings.push("WEBHOOK_SECRET is not set: Gitea webhook deliveries are accepted without authentication.");
  }
  return warnings;
};
