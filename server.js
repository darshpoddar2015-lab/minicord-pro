require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(cors());
app.use(express.static("public"));

/* ---------------- DATABASE ---------------- */

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error(err));

/* ---------------- AUTH ROUTES ---------------- */

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, password: hash });
    res.json({ message: "Registered successfully" });
  } catch {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: "Invalid credentials" });

  if (user.banned) return res.status(403).json({ error: "You are banned" });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  });

  res.json({ token, role: user.role });
});

/* ---------------- CHAT SYSTEM ---------------- */

let channels = {
  general: [],
  gaming: [],
  coding: []
};

let onlineUsers = {};

// Socket auth middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = await User.findById(decoded.id);

    if (!socket.user || socket.user.banned)
      return next(new Error("Unauthorized"));

    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", socket => {
  const user = socket.user;

  onlineUsers[socket.id] = user.username;

  socket.emit("channels", Object.keys(channels));
  io.emit("users", Object.values(onlineUsers));

  socket.on("joinChannel", channel => {
    if (!channels[channel]) return;
    socket.join(channel);
  });

  socket.on("message", ({ channel, text }) => {
    if (!channels[channel]) return;
    if (!text.trim()) return;

    const msg = { user: user.username, text };
    channels[channel].push(msg);

    io.to(channel).emit("message", {
      channel,
      user: user.username,
      text
    });
  });

  socket.on("kick", async username => {
    if (user.role !== "admin" && user.role !== "mod") return;

    const target = Object.entries(onlineUsers)
      .find(([id, name]) => name === username);

    if (target) {
      io.sockets.sockets.get(target[0])?.disconnect();
    }
  });

  socket.on("ban", async username => {
    if (user.role !== "admin") return;

    await User.updateOne({ username }, { banned: true });

    const target = Object.entries(onlineUsers)
      .find(([id, name]) => name === username);

    if (target) {
      io.sockets.sockets.get(target[0])?.disconnect();
    }
  });

  socket.on("disconnect", () => {
    delete onlineUsers[socket.id];
    io.emit("users", Object.values(onlineUsers));
  });
});

/* ---------------- BOT ---------------- */

function botMessage(channel, text) {
  io.to(channel).emit("message", {
    channel,
    user: "MiniBot",
    text
  });
}

setInterval(() => {
  botMessage("general", "Stay disciplined. Build daily.");
}, 60000);

/* ---------------- START SERVER ---------------- */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
