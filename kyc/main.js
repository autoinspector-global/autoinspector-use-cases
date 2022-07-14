const express = require("express");
const path = require("path");
const connectDB = require("./db/connect");

const { MongoMemoryServer } = require("mongodb-memory-server");

require("dotenv").config({
  path: ".env",
});

const Autoinspector = require("autoinspector");
const userEntity = require("./entities/user.entity");

// Instantiate autoinspector SDK
const autoinspector = new Autoinspector({
  apikey: process.env.AUTOINSPECTOR_API_KEY,
});

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/identity/verification", async (req, res) => {
  const { inspectionId } = req.query;

  const inspection = await autoinspector.inspections.retrieve({
    inspectionId: inspectionId,
  });

  const isInspectionApproved = inspection.veredict === "approved";

  if (isInspectionApproved) {
    await userEntity.updateOne(
      {
        _id: inspection.metadata.userId,
      },
      {
        $set: {
          verified: true,
        },
      }
    );

    return res.sendFile(
      path.join(__dirname, "public", "identity-success.html")
    );
  }

  return res.sendFile(path.join(__dirname, "public", "identity-declined.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/auth/register", async (req, res) => {
  const user = await userEntity.create({
    email: req.body.email,
    firstname: req.body.firstname,
    lastname: req.body.lastname,
    identification: req.body.identification,
    username: req.body.username,
    password: req.body.password,
    verified: false,
  });

  const inspection = await autoinspector.inspections.people.create({
    // Initialize the inspection with the started status. With this value, we avoid to start the inspection.
    callbackURL: `${req.get("origin")}/identity/verification`,
    initialStatus: "started",
    delivery: {
      // We disable the delivery of all notifications. By this way, we have full control about how to communicate with our users
      disabled: true,
    },
    metadata: {
      // We save as metadata our policy id. Later this value will be consume by the webhook at the moment of update our policy status
      userId: user._id,
    },
    producer: {
      internalId: user._id,
    },
    consumer: {
      email: user.email,
      firstName: user.firstname,
      lastName: user.lastname,
      identification: user.identification,
    },
    //Here we send built-in template alias mapping, so we don't need to send an unique template identifier.
    templateId: "easy",
  });

  res.status(301).redirect(inspection.magicLink);
});

const PORT = 4848;

app.listen(PORT, async () => {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  await connectDB(uri);

  console.log("kyc backend listening on:", PORT);
});
