import {Request, Router} from "express";
import {asyncWrap} from "../utils/asyncWrap.js";
import {AccountValidateRequestBody} from "../types/types.requests.js";
import {createGiteaApi} from "../api/gitea.js";
import {validateBaseUrl} from "../utils/data.js";

export const createValidateRouter = () => {
  const router = Router();

  router.post(
    "/",
    asyncWrap(async (req: Request<unknown, unknown, AccountValidateRequestBody>, res) => {
      const account = req.body.fields;

      validateBaseUrl(account.baseUrl);

      const gitea = createGiteaApi(account);
      const user = await gitea.validate();

      res.json({
        name: user.full_name || user.login,
      });
    }),
  );

  return router;
};
