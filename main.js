require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const { MongoClient, ObjectId } = require("mongodb");
const multer = require("multer");
const { GridFsStorage } = require("multer-gridfs-storage");

const app = express();
const PORT = 8080;
const HOST = "localhost";

app.use(express.json());
app.use(express.static("static"));
const MONGODB_URI = process.env.MONGODB_URL;
let gfs;
let db;
let mongoClient;

const storage = new GridFsStorage({
  url: MONGODB_URI,
  options: { useNewUrlParser: true, useUnifiedTopology: true },
  file: (req, file) => {
    return new Promise((resolve, reject) => {
      const filename = `${Date.now()}-${file.originalname}`;
      const fileInfo = {
        filename: filename,
        bucketName: "uploads",
        metadata: {
          originalname: file.originalname,
          contentType: file.mimetype,
        },
      };
      resolve(fileInfo);
    });
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "image/png" || file.mimetype === "image/jpeg") {
      cb(null, true);
    } else {
      cb(new Error("Only PNG and JPEG are allowed!"), false);
    }
  },
});

async function connectToMongo() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Mongoose connected successfully");

    const conn = mongoose.connection;
    gfs = new mongoose.mongo.GridFSBucket(conn.db, {
      bucketName: "uploads",
    });

    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db();

    console.log("MongoDB and GridFS initialized successfully");
    return mongoClient;
  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
    throw err;
  }
}

app.post("/upload-image", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded" });
  }
  console.log("File uploaded:", req.file);
  res.json({
    fileId: req.file.id ? req.file.id.toString() : req.file.filename,
    filename: req.file.filename,
  });
});

app.get("/", (req, res) => {
  res.redirect("/estoque.html");
});

app.get("/image/:id", async (req, res) => {
  try {
    const _id = new mongoose.Types.ObjectId(req.params.id);
    const collection = mongoose.connection.db.collection("uploads.files");
    const file = await collection.findOne({ _id });

    if (!file) {
      console.log("Image not found");
      return res.status(404).json({ error: "Image not found" });
    }

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    res.set("Content-Type", file.contentType);
    bucket.openDownloadStream(_id).pipe(res);
  } catch (err) {
    console.error("Error fetching image:", err);
    res.status(500).json({ error: "Error fetching image" });
  }
});

app.post("/cleanup-unused-images", async (req, res) => {
  try {
    const equipmentCollection = db.collection("equipments");
    const imageCollection = mongoose.connection.db.collection("uploads.files");
    const equipments = await equipmentCollection.find({}).toArray();
    const usedImageIds = new Set(
      equipments.map((e) => e.imageId).filter((id) => id),
    );
    const allImages = await imageCollection.find({}).toArray();

    let deletedCount = 0;

    for (const image of allImages) {
      const imageId = image._id.toString();
      if (!usedImageIds.has(imageId)) {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
          bucketName: "uploads",
        });
        await bucket.delete(image._id);
        deletedCount++;
        console.log(`Deleted unused image: ${imageId}`);
      }
    }

    res.json({
      message: `Cleanup completed. Deleted ${deletedCount} unused images.`,
    });
  } catch (error) {
    console.error("Error cleaning up unused images:", error);
    res.status(500).json({ error: "Error cleaning up unused images" });
  }
});

app.post("/add-equipment", async (req, res) => {
  try {
    const collection = db.collection("equipments");
    const data = req.body;

    console.log("Received data:", data); // Debug log

    if (data.id) {
      const id = data.id;
      delete data.id;
      if (!data.imageId) delete data.imageId;

      console.log("Updating document with imageId:", data.imageId);

      await collection.updateOne({ _id: new ObjectId(id) }, { $set: data });
      res.json({ message: "Equipment updated successfully" });
    } else {
      data.entryDate = new Date().toISOString().slice(0, 10);
      data.status = "Available";

      console.log("Inserting new document with imageId:", data.imageId);

      await collection.insertOne(data);
      res.status(201).json({ message: "Equipment added successfully" });
    }
  } catch (error) {
    console.error("Error adding/editing equipment:", error);
    res.status(500).json({ error: "Error adding/editing equipment" });
  }
});

app.post("/withdraw-equipment", async (req, res) => {
  try {
    let { id, withdrawDate, lastUser, note, quantity } = req.body;
    quantity = parseInt(quantity, 10);

    const collection = db.collection("equipments");
    const historyCollection = db.collection("equipment_history");
    const equipment = await collection.findOne({ _id: new ObjectId(id) });

    if (!equipment) {
      return res
        .status(404)
        .json({ error: "Equipment not found for withdrawal." });
    }

    const currentStock = parseInt(equipment.quantity, 10) || 0;

    if (quantity > currentStock) {
      return res
        .status(400)
        .json({ error: "Withdrawal quantity greater than available stock." });
    }

    const newStock = currentStock - quantity;

    // Add to history
    await historyCollection.insertOne({
      equipmentId: equipment._id,
      equipmentName: equipment.name,
      action: "withdraw",
      userName: lastUser,
      quantity: quantity,
      date: new Date(),
    });

    if (newStock === 0) {
      await collection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: "In use",
            withdrawDate,
            lastUser,
            note,
          },
        },
      );
    } else {
      await collection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            quantity: newStock,
            status: "Available",
          },
        },
      );

      const newEquipment = {
        ...equipment,
        _id: undefined,
        quantity: quantity,
        status: "In use",
        withdrawDate,
        lastUser,
        note,
        originId: equipment._id,
      };
      delete newEquipment._id;
      await collection.insertOne(newEquipment);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error withdrawing equipment:", error);
    res.status(500).json({ error: "Error withdrawing equipment" });
  }
});

app.post("/return-equipment", async (req, res) => {
  try {
    const { id } = req.body;
    const collection = db.collection("equipments");

    const inUseDoc = await collection.findOne({ _id: new ObjectId(id) });
    if (!inUseDoc) {
      return res.status(404).json({ error: "Equipment not found for return." });
    }

    if (
      inUseDoc.status === "In use" &&
      inUseDoc.lastUser &&
      inUseDoc.originId
    ) {
      const originalDoc = await collection.findOne({
        _id: new ObjectId(inUseDoc.originId),
      });

      if (originalDoc) {
        await collection.updateOne(
          { _id: originalDoc._id },
          {
            $inc: { quantity: inUseDoc.quantity },
            $set: { status: "Available" },
          },
        );
      } else {
        const newAvailable = {
          ...inUseDoc,
          status: "Available",
          lastUser: "",
          withdrawDate: "",
          note: "",
        };
        delete newAvailable._id;
        await collection.insertOne(newAvailable);
      }

      await collection.deleteOne({ _id: new ObjectId(id) });

      return res.json({ success: true });
    } else {
      await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "Available", withdrawDate: "", lastUser: "" } },
      );
      return res.json({ success: true });
    }
  } catch (error) {
    console.error("Error returning equipment:", error);
    res.status(500).json({ error: "Error returning equipment" });
  }
});

app.post("/delete-equipment", async (req, res) => {
  try {
    const { id, quantity, deletedBy } = req.body;
    const collection = db.collection("equipments");
    const historyCollection = db.collection("equipment_history");
    const equipment = await collection.findOne({ _id: new ObjectId(id) });

    if (!equipment) {
      return res
        .status(404)
        .json({ error: "Equipment not found for deletion." });
    }

    const currentStock = parseInt(equipment.quantity, 10) || 0;
    const deleteQuantity = parseInt(quantity, 10);

    if (deleteQuantity > currentStock) {
      return res
        .status(400)
        .json({ error: "Deletion quantity exceeds available stock." });
    }

    // Add to history
    await historyCollection.insertOne({
      equipmentId: equipment._id,
      equipmentName: equipment.name,
      action: "delete",
      userName: deletedBy,
      quantity: deleteQuantity,
      date: new Date(),
    });

    if (deleteQuantity === currentStock) {
      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) {
        return res
          .status(404)
          .json({ error: "Equipment not found for deletion." });
      }
      res.json({ success: true, message: "Equipment deleted completely." });
    } else {
      const newStock = currentStock - deleteQuantity;
      await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { quantity: newStock } },
      );
      res.json({
        success: true,
        message: `Equipment stock updated. Remaining quantity: ${newStock}`,
      });
    }
  } catch (error) {
    console.error("Error deleting equipment:", error);
    res.status(500).json({ error: "Error deleting equipment" });
  }
});

app.get("/get_all_equipments", async (req, res) => {
  try {
    const collection = db.collection("equipments");
    const documents = await collection.find({}).toArray();
    const docsWithId = documents.map((doc) => ({
      ...doc,
      id: doc._id.toString(),
    }));
    res.json(docsWithId);
  } catch (err) {
    res.status(500).json({ error: "Error fetching audit data" });
  }
});

app.get("/get-equipment-history/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const historyCollection = db.collection("equipment_history");
    
    // Find history for this specific equipment or any equipment with the same originId
    const equipment = await db.collection("equipments").findOne({ _id: new ObjectId(id) });
    if (!equipment) {
      return res.status(404).json({ error: "Equipment not found" });
    }

    // Get history for both the equipment itself and any equipment that originated from it
    const historyQuery = {
      $or: [
        { equipmentId: new ObjectId(id) },
        { equipmentId: equipment.originId ? new ObjectId(equipment.originId) : null }
      ].filter(Boolean)
    };

    const history = await historyCollection
      .find(historyQuery)
      .sort({ date: -1 })
      .toArray();

    res.json({
      success: true,
      history: history
    });
  } catch (error) {
    console.error("Error fetching equipment history:", error);
    res.status(500).json({ error: "Error fetching equipment history" });
  }
});

async function startServer() {
  try {
    await connectToMongo();

    app.listen(PORT, HOST, () => {
      console.log(`Server running at http://${HOST}:${PORT}`);
      console.log(
        `Access inventory page at http://${HOST}:${PORT}/inventory.html`,
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}
startServer();
