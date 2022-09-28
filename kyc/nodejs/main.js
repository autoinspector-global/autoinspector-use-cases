const express = require('express')
const path = require('path')
const connectDB = require('./db/connect')

const { MongoMemoryServer } = require('mongodb-memory-server')

require('dotenv').config({
  path: '.env',
})

const Autoinspector = require('autoinspector')
const userEntity = require('./entities/user.entity')

// Instantiate autoinspector SDK
const autoinspector = new Autoinspector({
  apikey: process.env.AUTOINSPECTOR_API_KEY,
})

const app = express()

app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))

app.get('/identity/verification', async (req, res) => {
  // Here we extract the inspectionId from the request query
  const { inspectionId } = req.query

  // Find the inspection id to check the veredict and know to who belongs to
  const inspection = await autoinspector.inspections.retrieve(inspectionId)

  const isInspectionApproved = inspection.veredict === 'approved'

  if (isInspectionApproved) {
    //If the inspection is approved, we verify the user account
    await userEntity.updateOne(
      {
        _id: inspection.metadata.userId,
      },
      {
        $set: {
          verified: true,
        },
      }
    )

    // We send the view to tell to the user that their account is verified
    return res.sendFile(path.join(__dirname, 'public', 'identity-success.html'))
  }

  // Otherwise, we send the view to tell to the user that their could not verify their identity
  return res.sendFile(path.join(__dirname, 'public', 'identity-declined.html'))
})

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.post('/auth/register', async (req, res) => {
  // We create the user
  const user = await userEntity.create({
    email: req.body.email,
    firstname: req.body.firstname,
    lastname: req.body.lastname,
    identification: req.body.identification,
    username: req.body.username,
    password: req.body.password,
    // See that here we start the user as non verified one
    verified: false,
  })

  const inspection = await autoinspector.inspections.people.create({
    locale: 'es_AR',
    // See here that we pass the callbackURL. Because our server takes care of backend and frontend, we need the user back to our same domain
    callbackURL: `${req.get('origin')}/identity/verification`,
    initialStatus: 'started',
    delivery: {
      // We disable the delivery of all notifications. By this way, we avoid to send emails from Autoinspector to our client
      disabled: true,
    },
    metadata: {
      // We save as metadata our policy id. Later this value will be consume by the webhook at the moment of update our policy status
      userId: user._id,
    },
    producer: {
      internalId: user._id,
    },
    // Here we pass all the information related to our user registered
    consumer: {
      email: user.email,
      firstName: user.firstname,
      lastName: user.lastname,
      identification: user.identification,
    },
    //Here we send a built-in template alias. If you want to customize your inspection template, you can do it using inspection studio
    templateId: 'easy',
  })

  //Here we redirect our user from our domain to Autoinspector Inspection App usin the magicLink property
  res.status(301).redirect(inspection.magicLink)
})

const PORT = 4848

app.listen(PORT, async () => {
  const mongod = await MongoMemoryServer.create()
  const uri = mongod.getUri()

  await connectDB(uri)

  console.log('kyc backend listening on:', PORT)
})
