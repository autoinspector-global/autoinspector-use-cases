const { response } = require("express");
const express = require("express");
const mongoose = require("mongoose");
const {
  default: availableGoodEntity,
} = require("./entity/available-good.entity");
const {
  default: availablePolicyEntity,
} = require("./entity/available-policy.entity");
const { default: customerEntity } = require("./entity/customer.entity");
const { default: policyEntity } = require("./entity/policy.entity");
const Autoinspector = require("autoinspector").default;

const autoinspector = new Autoinspector({
  apikey: process.env.AUTOINSPECTOR_API_KEY,
});

const connectDB = () => {
  return new Promise((resolve, reject) => {
    mongoose.connect(process.env.DB_URI, {}, (err) => {
      if (err) reject(err);

      resolve("connected to db successfully!");
    });
  });
};

const app = express();

app.post("/policy/:availablePolicyId", async (req, res, next) => {
  const availablePolicy = await availablePolicyEntity.findOne({
    _id: req.params.availablePolicyId,
  });

  const customer = await customerEntity.createOne({
    occupation: req.body.occupation,
    name: req.body.name,
  });

  const policy = await policyEntity.create({
    customerId: customer._id,
    availablePolicyId: availablePolicy._id,
    status: "waiting_verification",
  });

  const inspection = await autoinspector.inspections.goods.create({
    metadata: {
      policyId: policy._id,
    },
    producer: {},
    goods: [],
    consumer: {
      email: req.body.email,
      firstName: req.body.firstName,
      identification: req.body.identification,
      lastName: req.body.lastName,
    },
    templateId: "easy", // Here we are using built-in template alias. If your template is custom, then you have to pass template id
  });

  await policyEntity.updateOne(
    {
      _id: policy._id,
    },
    {
      $set: {
        inspectionId: inspection.inspectionId,
      },
    }
  );

  res.status(201).json({
    policyId: policy._id,
  });
});

app.post("/policy/:policyId/items", async (req, res, next) => {
  const availableGoods = await availableGoodEntity.find({
    _id: {
      $in: req.body.availableGoodsIds,
    },
  });

  await policyEntity.updateOne(
    {
      _id: req.params.policyId,
    },
    {
      $push: {
        goods: availableGoods.map((good) => good._id),
      },
    }
  );

  await autoinspector.inspections.goods.addGoodItem({
    goods: availableGoods,
  });

  res.status(201).json({ success: true });
});

app.post("/policy/:policyId/items", async (req, res) => {
  const availableGoods = await availableGoodEntity.find({
    _id: {
      $in: req.body.availableGoodsIds,
    },
  });

  const goods = await autoinspector.inspections.goods.addGoodItem({
    goods: availableGoods,
  });

  await policyEntity.updateOne(
    {
      _id: req.params.policyId,
    },
    {
      $push: {
        goods: availableGoods.map((availableGood, index) => {
          return {
            _id: availableGood._id,
            productInspectionId: goods.productIds[index],
          };
        }),
      },
    }
  );

  res.status(201).json({ success: true });
});

app.post(
  "/policy/:policyId/availableGood/:availableGoodId/inspection/image",
  async (req, res) => {
    const policy = await policyEntity.findOne({
      _id: req.params.policyId,
      "goods.availableGoodId": req.params.availableGoodId,
    });

    const goodPolicy = policy.goods.find(
      (good) => good.availableGoodId.toString() === req.params.availableGoodId
    );

    const imageToken = await autoinspector.images.generateToken({
      productId: goodPolicy.productInspectionId,
      side: req.params.side,
      coordinates: req.params.coordinates,
    });

    res.status(201).json({ imageToken });
  }
);

app.post("/policy/:policyId/inspection/finish", async (req, res) => {
  const policy = await policyEntity.findOne({
    _id: req.params.policyId,
  });

  await autoinspector.inspections.finish({
    inspectionId: policy.inspectionId,
  });

  res.status(200).json({ imageToken });
});

app.post(
  "/webhook/autoinspector",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["autoinspector-signature"];

    let webhook;

    try {
      webhook = autoinspector.webhooks.constructEvent(
        request.body,
        signature,
        process.env.AUTOINSPECTOR_WEBHOOK_SECRET
      );
    } catch (err) {
      return response
        .status(400)
        .json({ error: `Webhook error: ${err.message} ` });
    }

    switch (webhook.event) {
      case "inspection_completed":
        const isInspectionApproved = webhook.payload.veredict === "approved";

        if (isInspectionApproved) {
          await policyEntity.updateOne(
            {
              _id: webhook.payload.metadata.policyId,
            },
            {
              $set: {
                status: "issued",
                startDate: new Date(),
              },
            }
          );
        }

        if (!isInspectionApproved) {
          await policyEntity.updateOne(
            {
              _id: webhook.payload.metadata.policyId,
            },
            {
              $set: {
                status: "declined",
              },
            }
          );
        }

        break;

      default:
        console.log(`Unhandled autoinspector event: ${webhook.event}`);
    }

    res.status(200).json({ received: true });
  }
);

app.listen(process.env.API_PORT, async () => {
  await connectDB();

  console.log("digital insurer backend listening on:", process.env.API_PORT);
});
