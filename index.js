const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection URL (from environment variable)
const mongoURI = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(mongoURI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("Error connecting to MongoDB:", err);
    process.exit(1); // Exit the process if the connection fails
  });

// Invoice Schema
const invoiceSchema = new mongoose.Schema({
  invoiceNumber: String,
  invoiceDate: Date,
  itemName: String,
  price: Number,
  expiryDate: Date,
  done: { type: Boolean, default: false }, // Added field for "done" status
});

const Invoice = mongoose.model("Invoice", invoiceSchema);

// Utility function to format date to yyyy-mm-dd
const formatDate = (dateString) => {
  const date = new Date(dateString);
  if (isNaN(date)) return "Invalid Date"; // Return "Invalid Date" if invalid date
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is zero-based
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Routes
app.post("/invoices", async (req, res) => {
  try {
    const { invoiceNumber, invoiceDate, itemName, price, expiryDate } = req.body;

    // Ensure that the dates are valid before saving
    const formattedInvoiceDate = new Date(invoiceDate);
    const formattedExpiryDate = new Date(expiryDate);

    if (isNaN(formattedInvoiceDate) || isNaN(formattedExpiryDate)) {
      return res.status(400).send({ message: "Invalid date format." });
    }

    const invoice = new Invoice({
      invoiceNumber,
      invoiceDate: formattedInvoiceDate,
      itemName,
      price,
      expiryDate: formattedExpiryDate,
    });

    await invoice.save();
    res.send(invoice);
  } catch (error) {
    res.status(500).send({ message: "Error creating invoice", error: error.message });
  }
});

app.get("/invoices", async (req, res) => {
  try {
    const invoices = await Invoice.find();

    // Format the dates before sending to the frontend
    const formattedInvoices = invoices.map((invoice) => ({
      ...invoice.toObject(),
      invoiceDate: formatDate(invoice.invoiceDate),
      expiryDate: formatDate(invoice.expiryDate),
    }));

    // Sort invoices with the ones expiring soon on top
    formattedInvoices.sort((a, b) => {
      const aIsExpiringSoon = isExpiringSoon(a.expiryDate);
      const bIsExpiringSoon = isExpiringSoon(b.expiryDate);

      if (aIsExpiringSoon && !bIsExpiringSoon) return -1;
      if (!aIsExpiringSoon && bIsExpiringSoon) return 1;

      return 0;
    });

    res.send(formattedInvoices);
  } catch (error) {
    res.status(500).send({ message: "Error fetching invoices", error: error.message });
  }
});

app.delete("/invoices/:id", async (req, res) => {
  try {
    await Invoice.findByIdAndDelete(req.params.id);
    res.send({ message: "Invoice deleted" });
  } catch (error) {
    res.status(500).send({ message: "Error deleting invoice", error: error.message });
  }
});

// Toggle "done" status endpoint
app.put("/invoices/:id/done", async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).send({ message: "Invoice not found" });

    invoice.done = !invoice.done;  // Toggle the done status
    await invoice.save();
    res.send(invoice);
  } catch (error) {
    res.status(500).send({ message: "Error updating invoice status", error: error.message });
  }
});

// Check if the expiryDate is 1 day away
const isExpiringSoon = (expiryDate) => {
  const expiry = new Date(expiryDate);
  const currentDate = new Date();
  const timeDiff = expiry.getTime() - currentDate.getTime();
  const dayInMs = 24 * 60 * 60 * 1000; // 1 day in milliseconds
  return timeDiff <= dayInMs && timeDiff >= 0; // Expiring in the next day
};

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ message: "Something went wrong!" });
});
