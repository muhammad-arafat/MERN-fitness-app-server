const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8ni3cgn.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    //
    //
    // db collection

    const userCollection = client.db("syncFitDb").collection("users");
    const reviewCollection = client.db("syncFitDb").collection("reviews");
    const subscriberCollection = client
      .db("syncFitDb")
      .collection("subscribers");
    const imageCollection = client.db("syncFitDb").collection("exerciseImages");
    const trainerCollection = client.db("syncFitDb").collection("trainers");
    const trainerApplicationCollection = client
      .db("syncFitDb")
      .collection("trainerApplications");
    const forumCollection = client.db("syncFitDb").collection("forums");
    const classCollection = client.db("syncFitDb").collection("classes");
    const packageCollection = client.db("syncFitDb").collection("packages");
    const trainerBookingCollection = client
      .db("syncFitDb")
      .collection("trainersSlotBooking");

    const paymentCollection = client
      .db("syncFitDb")
      .collection("trainersPayment");

    //
    //

    // jwt related apis
    //  creation of jwt token and sending as obj to frontend

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      // console.log(user);
      const token = jwt.sign(user, process.env.JWT_ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    //  verify if the token is valid, then send to protected api

    const verifyToken = (req, res, next) => {
      // console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.JWT_ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    //

    // users related apis
    // saving a user while log in/registration for first time
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const isExist = await userCollection.findOne(query);
      if (isExist) {
        return res.send({ status: "user already exists" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // testimonial/reviews api
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // subscriptions user api
    app.post("/subscriptions", async (req, res) => {
      const subscriber = req.body;
      const result = await subscriberCollection.insertOne(subscriber);
      res.send(result);
    });
    app.get("/subscribers", async (req, res) => {
      const result = await subscriberCollection.find().toArray();
      res.send(result);
    });

    // images api
    app.get("/images", async (req, res) => {
      const result = await imageCollection.find().toArray();
      res.send(result);
    });

    // trainers api
    app.get("/trainers", async (req, res) => {
      const result = await trainerCollection.find().toArray();
      res.send(result);
    });

    // specific trainer details
    app.get("/trainer-details/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await trainerCollection.findOne(query);
      res.send(result);
    });

    // trainer slot getting api
    app.get("/get-timeslot/:id/:day/:index", async (req, res) => {
      const { id, day, index } = req.params;

      try {
        const trainer = await trainerCollection.findOne({});
        const timeSlotOfDay = trainer.timeSlotOfDays[day];

        if (!timeSlotOfDay || index >= timeSlotOfDay.length) {
          return res.status(404).json({ message: "Time slot not found" });
        }

        const clickedSlot = timeSlotOfDay[index];
        res.json(clickedSlot);
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    //
    // trainer slot booking api
    //

    app.post("/trainer-bookings", async (req, res) => {
      const bookedPackage = req.body;
      const result = await trainerBookingCollection.insertOne(bookedPackage);
      res.send(result);
    });

    // bookings of trainers slot
    app.get("/trainer-bookings/trainer/:email", async (req, res) => {
      const email = req.params.email;
      const query = { trainerEmail: email };
      const result = await trainerBookingCollection.find(query).toArray();
      // console.log(result);
      res.send(result);
    });

    // bookings of member
    app.get("/all-bookings/member/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await trainerBookingCollection.find(query).toArray();
      // console.log(result);
      res.send(result);
    });

    //
    //
    //
    //
    //

    // payment intent

    app.post("/create-payment-intent", async (req, res) => {
      const { salary } = req.body;
      const amount = parseInt(salary * 100);
      console.log(amount, "amount inside the intent stripe");

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    //
    //
    app.post("/trainers-payment", async (req, res) => {
      try {
        const payment = req.body;
        await trainerCollection.updateOne(
          { email: payment.email },
          {
            $set: { payment: "paid" },
          }
        );

        const paymentResult = await paymentCollection.insertOne(payment);
        console.log("payment info", payment);
        res.status(200).json({ paymentResult });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    //

    //
    // packages api
    app.get("/packages", async (req, res) => {
      const result = await packageCollection.find().toArray();
      res.send(result);
    });

    // trainer application from (become a trainer)
    app.post("/trainer-applications", async (req, res) => {
      const form = req.body;
      const result = await trainerApplicationCollection.insertOne(form);
      res.send(result);
    });

    app.get("/trainer-applications", async (req, res) => {
      const result = await trainerApplicationCollection.find().toArray();
      res.send(result);
    });

    app.patch(
      "/trainer-applications/admin/:id",

      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updatedDoc = {
          $set: {
            role: "trainer",
            salary: 1200,
            payment: "pending",
            acceptanceDate: new Date(),
          },
        };
        const result = await trainerApplicationCollection.updateOne(
          filter,
          updatedDoc,
          options
        );

        if (result.modifiedCount > 0) {
          const patchedDoc = await trainerApplicationCollection.findOne(filter);

          await trainerCollection.insertOne(patchedDoc);

          await trainerApplicationCollection.deleteOne(filter);

          // changing role of user as trainer in userCollection
          const userEmail = patchedDoc.email;
          const userFilter = { email: userEmail };
          const userUpdate = {
            $set: {
              role: "trainer",
              acceptanceDate: new Date(),
            },
          };
          await userCollection.updateOne(userFilter, userUpdate);

          res.send({
            success: true,
            message:
              "Application moved to trainers collection and role in user collection updated as trainer",
          });
        } else {
          res
            .status(404)
            .send({ success: false, message: "Application not found." });
        }
      }
    );

    // community/forum api
    app.get("/forums", async (req, res) => {
      const result = await forumCollection.find().toArray();
      res.send(result);
    });
    app.post("/forums", async (req, res) => {
      const classes = req.body;
      const result = await forumCollection.insertOne(classes);
      res.send(result);
    });

    //
    //
    // Dashboard Trainer all apis
    //
    // classes api
    app.post("/classes", async (req, res) => {
      const classes = req.body;
      const result = await classCollection.insertOne(classes);
      res.send(result);
    });
    app.get("/classes", async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });
    app.get("/class-details/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("SyncFit Connect server...");
});

app.listen(port, () => {
  console.log(`SyncFit Connect is running on port ${port}`);
});
