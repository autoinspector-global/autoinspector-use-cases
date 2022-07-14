const express = require("express");
const connectDB = require("./db/connect");
const availablePolicyEntity = require("./entity/available-policy.entity");
const customerEntity = require("./entity/customer.entity");

const policyEntity = require("./entity/policy.entity");

const { MongoMemoryServer } = require("mongodb-memory-server");

require("dotenv").config({
  path: ".env",
});

const Autoinspector = require("autoinspector");
const availableGoodEntity = require("./entity/available-good.entity");
const AvailablePoliciesSeeder = require("./db/seeders/available-policies.seeder");
const AvailableGoodsSeeder = require("./db/seeders/available-goods.seeder");
const flow = require("./test/flow");

// Instantiate autoinspector SDK
const autoinspector = new Autoinspector({
  apikey: process.env.AUTOINSPECTOR_API_KEY,
});

const app = express();

// Here we sent into the request a new key: rawBody. This new key will have the buffer as he cames without parses. This new key will be consumed in the webhook endpoint, at the moment of verify hmac signature.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.post("/policy/:availablePolicyId", async (req, res) => {
  const availablePolicy = await availablePolicyEntity.findOne({
    _id: req.params.availablePolicyId,
  });

  const customer = await customerEntity.create({
    occupation: req.body.customer.occupation,
    firstname: req.body.customer.firstname,
    lastname: req.body.customer.lastname,
    email: req.body.customer.email,
    identification: req.body.customer.identification,
  });

  const policy = await policyEntity.create({
    customerId: customer._id,
    availablePolicyId: availablePolicy._id,
    status: "waiting_verification",
  });

  const inspection = await autoinspector.inspections.goods.create({
    // Initialize the inspection with the started status. With this value, we avoid to start the inspection.
    initialStatus: "started",
    delivery: {
      // We disable the delivery of all notifications. By this way, we have full control about how to communicate with our users
      disabled: true,
    },
    metadata: {
      // We save as metadata our policy id. Later this value will be consume by the webhook at the moment of update our policy status
      policyId: policy._id,
    },
    producer: {
      internalId: customer._id,
    },
    consumer: {
      email: customer.email,
      firstName: customer.firstname,
      lastName: customer.lastname,
      identification: customer.identification,
    },
    // We pass the template id that we created before. Here, we are mapping the environment variables exported from .env file.
    templateId: process.env.AUTOINSPECTOR_CUSTOM_TEMPLATE_ID,
  });

  // Update the policy entity defining the inspection id. This is a must if we want to associate policy <-> inspection
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
    inspectionId: inspection.inspectionId,
  });
});

app.get("/test/flow", async (req, res) => {
  try {
    await flow();
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send(err);
  }
});

app.post("/policy/:policyId/items", async (req, res) => {
  //Create a list of strings that belongs to available goods ids
  const availableGoodsIds = req.body.goods.map((good) => good.availableGoodId);

  //Make a bulk get query to the database
  const availableGoods = await availableGoodEntity
    .find({
      _id: {
        $in: availableGoodsIds,
      },
    })
    .lean();

  //Prepare the goods array to send to Autoinspector API
  const goodsMerged = availableGoods.map((availableGood, index) => {
    const goodDetails = req.body.goods[index];

    return {
      ...goodDetails,
      ...availableGood,
    };
  });

  const policy = await policyEntity.findOne({
    _id: req.params.policyId,
  });

  // Add the goods to the tinspection
  const goods = await autoinspector.inspections.goods.addGoods(
    policy.inspectionId,
    goodsMerged
  );

  // Prepare the goods array to set into the policy object
  const goodsToPush = availableGoods.map((availableGood, index) => {
    const productInspectionId = goods.productIds[index];
    const goodDetails = req.body.goods[index];

    return {
      availableGoodId: availableGood._id,
      productInspectionId: productInspectionId,
      type: availableGood.type,
      category: availableGood.category,
      make: goodDetails.make,
      model: goodDetails.model,
      price: goodDetails.price,
    };
  });

  // Push into the goods property of the policy entity the goods list built
  const policyUpdate = await policyEntity.findOneAndUpdate(
    {
      _id: req.params.policyId,
    },
    {
      $push: {
        goods: goodsToPush,
      },
    },
    {
      new: true,
    }
  );

  res.status(201).json(policyUpdate.goods);
});

app.post(
  "/policy/:policyId/goods/:goodId/inspection/image",
  async (req, res) => {
    // Get the policy that good belongs to
    const policy = await policyEntity.findOne({
      _id: req.params.policyId,
      "goods._id": req.params.goodId,
    });

    const goodPolicy = policy.goods.find(
      (good) => good._id.toString() === req.params.goodId
    );

    // Generates the image token and return it
    const imageToken = await autoinspector.images.generateToken({
      productId: goodPolicy.productInspectionId,
      side: req.body.side,
      coordinates: req.body.coordinates,
    });

    res.status(201).json({ imageToken });
  }
);

app.post("/policy/:policyId/inspection/finish", async (req, res) => {
  const policy = await policyEntity.findOne({
    _id: req.params.policyId,
  });

  // Complete the inspection
  await autoinspector.inspections.finish({
    inspectionId: policy.inspectionId,
  });

  res.status(200).json({ finish: true });
});

app.post("/webhook", async (req, res) => {
  // This is Autoinspector SHA256 signature to verify if the request body is corrupted and to ensure that who are making the request is Autoinspector API
  const signature = req.headers["autoinspector-signature"];

  let webhook;

  try {
    //Here we use the autoinspector sdk to handle al the hmac validation. Just pass the req.rawBody that we set at the beginning via middleware, the signature provided from request and the webhook secret generated by Autoinspector for us
    webhook = autoinspector.webhooks.constructEvent(
      req.rawBody,
      signature,
      process.env.AUTOINSPECTOR_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message} ` });
  }

  // At this point is safely to map the webhook properties. We know that message is not corrupted and comes from Autoinspector
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
});

app.get("/available-goods", async (req, res) => {
  const availableGoods = await availableGoodEntity.find();

  res.status(200).json(availableGoods);
});

app.get("/available-policies", async (req, res) => {
  const availablePolicy = await availablePolicyEntity.find();

  res.status(200).json(availablePolicy);
});

const PORT = 4848;

app.listen(PORT, async () => {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  await connectDB(uri);

  // A couple of seeders to start with initial data in our database
  await AvailablePoliciesSeeder.seed();
  await AvailableGoodsSeeder.seed();

  console.log("digital insurer backend listening on:", PORT);
});
