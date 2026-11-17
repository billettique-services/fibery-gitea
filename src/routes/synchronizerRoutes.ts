import express, {Request} from "express";
import {asyncWrap} from "../utils/asyncWrap.js";
import {ValidationError} from "../errors/errors.js";
import {SynchronizerSchema} from "../types/types.synchronizerSchema.js";
import {getSynchronizerConfig} from "../synchronizer/configProvider.js";
import {
  DatalistRequestBody,
  GetDataRequestBody,
  GetSynchronizerSchemaRequestBody,
  WebhookInstallRequestBody,
  WebhookPreProcessRequestBody,
  WebhookTransformRequestBody,
} from "../types/types.requests.js";
import {getSchema} from "../synchronizer/schemaProvider.js";
import {getData} from "../synchronizer/dataProvider.js";
import {getDatalist} from "../synchronizer/datalistProvider.js";
import {SynchronizerData} from "../types/types.synchronizerData.js";
import {installWebhook, preProcessWebhook, transformWebhook} from "../synchronizer/webhookProvider.js";

export const createSynchronizerRoutes = () => {
  const router = express.Router();

  router.post("/config", (req, res) => {
    res.json(getSynchronizerConfig());
  });

  router.post(
    "/schema",
    asyncWrap(async (req: Request<unknown, SynchronizerSchema, GetSynchronizerSchemaRequestBody>, res) => {
      const {types, account} = req.body;
      if (!types) {
        throw new ValidationError(`"types" are missing`);
      }
      const schema = await getSchema(types, account);
      res.json(schema);
    }),
  );

  router.post("/filter/validate", (req, res) => {
    res.json({});
  });

  router.post(
    "/datalist",
    asyncWrap(async (req: Request<unknown, unknown, DatalistRequestBody>, _res) => {
      const {account, field} = req.body;

      if (!account) {
        throw new ValidationError(`"account" is missing`);
      }

      if (!field) {
        throw new ValidationError(`"field" is missing`);
      }

      _res.json(await getDatalist(field, account));
    }),
  );

  router.post(
    "/data",
    asyncWrap(async (req: Request<unknown, SynchronizerData<unknown>, GetDataRequestBody>, res) => {
      const {account, requestedType, filter, lastSynchronizedAt, pagination} = req.body;

      if (!account) {
        throw new ValidationError(`"account" is missing`);
      }

      if (!requestedType) {
        throw new ValidationError(`"requestedType" is missing`);
      }

      res.json(
        await getData({
          account,
          requestedType,
          filter,
          lastSynchronizedAt,
          pagination,
        }),
      );
    }),
  );

  router.post("/webhooks", (req: Request<unknown, unknown, WebhookInstallRequestBody>, res) => {
    res.json(installWebhook(req.body));
  });

  router.post("/webhooks/pre-process", (req: Request<unknown, unknown, WebhookPreProcessRequestBody>, res) => {
    const {statusCode, body} = preProcessWebhook(req.body);
    res.status(statusCode).json(body);
  });

  router.post(
    "/webhooks/transform",
    asyncWrap(async (req: Request<unknown, unknown, WebhookTransformRequestBody>, res) => {
      res.json(await transformWebhook(req.body));
    }),
  );

  return router;
};
