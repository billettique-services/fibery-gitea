import express, {Request} from "express";
import {asyncWrap} from "../utils/asyncWrap.js";
import {AppError, ValidationError} from "../errors/errors.js";
import {createGiteaApi} from "../api/gitea.js";
import {CREATE_BRANCH_ACTION} from "../connectorConfig.js";
import {ExecuteActionRequestBody} from "../types/types.requests.js";
import {parseRepoFullName, validateBaseUrl} from "../utils/data.js";

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const createAutomationRoutes = () => {
  const router = express.Router();

  router.post(
    "/action/execute",
    asyncWrap(async (req: Request<unknown, unknown, ExecuteActionRequestBody>, res) => {
      const {action, account} = req.body;

      if (!account) {
        throw new ValidationError(`"account" is missing`);
      }
      if (!action?.action) {
        throw new ValidationError(`"action" is missing`);
      }
      if (action.action !== CREATE_BRANCH_ACTION) {
        throw new ValidationError(`Unknown action "${action.action}"`);
      }

      validateBaseUrl(account.baseUrl);
      const repo = text(action.args?.repo);
      const name = text(action.args?.name);
      const ref = text(action.args?.ref) || undefined;
      if (!repo) {
        throw new ValidationError(`"repo" is required`);
      }
      if (!name) {
        throw new ValidationError(`"name" is required`);
      }
      const {owner, repo: repoName} = parseRepoFullName(repo);

      try {
        await createGiteaApi(account).createBranch(owner, repoName, name, ref);
      } catch (e) {
        // Gitea answers 409 when the branch already exists and 404 for an unknown repository or source ref.
        // Surface them as plain failures so the automation shows Gitea's message.
        if (e instanceof AppError && (e.statusCode === 404 || e.statusCode === 409 || e.statusCode === 403)) {
          throw new AppError({statusCode: e.statusCode, message: e.message, tryLater: false});
        }
        throw e;
      }

      res.json({});
    }),
  );

  return router;
};
