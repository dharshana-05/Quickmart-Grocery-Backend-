const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection
mongoose.connect("mongodb://localhost:27017/quickmartgrocery", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema({
  id: String,
  name: String,
  email: { type: String, unique: true },
  password: String,
});
const User = mongoose.model("User", userSchema);

// Product Schema with Dynamic Category Support
const productSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  quantity: Number,
  image: String,
  category: { type: String, required: true },
});
const Product = mongoose.model("Product", productSchema);

// Cart Schema
const cartSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      quantity: { type: Number, required: true },
    },
  ],
});
const Cart = mongoose.model("Cart", cartSchema);

// Order Schema
const orderSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      quantity: { type: Number, required: true },
    },
  ],
  totalPrice: { type: Number, required: true },
  address: String,
  paymentMethod: String,
  status: { type: String, default: "Pending" },
});
const Order = mongoose.model("Order", orderSchema);

// Middleware for Authentication
const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied. No token provided" });

  try {
    const decoded = jwt.verify(token, "secret_key");
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

// User Signup Route
app.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    if (await User.findOne({ email })) {
      return res.status(400).json({ message: "Email already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ id: uuidv4(), name, email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error", error });
  }
});

// User Login Route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid email" });

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign({ id: user.id }, "secret_key", { expiresIn: "24h" });
    res.status(200).json({ token, userId: user.id });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error", error });
  }
});

// Product Routes
app.get("/api/products", async (req, res) => {
  try {
    const { category } = req.query; // Getting category from query parameter
    const query = category ? { category } : {}; // Filter if category exists
    const products = await Product.find(query);
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch products", error });
  }
});


app.post("/api/products", async (req, res) => {
  try {
    const newProduct = new Product(req.body);
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ message: "Error creating product", error });
  }
});

// Cart Routes
app.get("/api/cart", authMiddleware, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user.id }).populate("items.productId");
    if (!cart) return res.status(200).json({ items: [] });

    res.status(200).json(cart.items.map(item => ({
      id: item.productId._id,
      name: item.productId.name,
      price: item.productId.price,
      quantity: item.quantity,
      image: item.productId.image,
    })));
  } catch (error) {
    res.status(500).json({ message: "Error fetching cart", error });
  }
});

app.post("/api/cart", authMiddleware, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    let cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) cart = new Cart({ userId: req.user.id, items: [] });

    const existingItem = cart.items.find(item => item.productId.toString() === productId);
    if (existingItem) existingItem.quantity += quantity;
    else cart.items.push({ productId, quantity });

    await cart.save();
    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: "Error adding to cart", error });
  }
});

// Order Routes
app.post("/api/order", authMiddleware, async (req, res) => {
  try {
    const { address, paymentMethod } = req.body;
    const cart = await Cart.findOne({ userId: req.user.id }).populate("items.productId");
    if (!cart || cart.items.length === 0) return res.status(400).json({ message: "Cart is empty" });

    const totalPrice = cart.items.reduce((total, item) => total + item.productId.price * item.quantity, 0);
    const order = new Order({ userId: req.user.id, items: cart.items, totalPrice, address, paymentMethod });
    await order.save();

    cart.items = [];
    await cart.save();

    res.status(201).json({ message: "Order placed successfully", order });
  } catch (error) {
    res.status(500).json({ message: "Error placing order", error });
  }
});

// Start Server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
