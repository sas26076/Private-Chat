const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// ==============================
// USERS — ali_h اضافه شد
// ==============================
const USERS = [
  { username: "reza_xh", password: "rezaxh00" },
  { username: "mahdi", password: "mahdi_11" },
  { username: "mahdi1", password: "mahdi_0042" },
  { username: "yasin", password: "yasin_1451" },
  { username: "user5", password: "pass5" },
  { username: "user6", password: "pass6" },
  { username: "user7", password: "pass7" },
  { username: "user8", password: "pass8" },
  { username: "user9", password: "pass9" },
  { username: "user10", password: "pass10" },,
  // 👑 سلطان
  { username: "ali_h", password: "zxcasdqwe12" }
];

// کاربران خاص (تاج‌دار)
const ROYAL_USERS = new Set(["ali_h"]);

app.use(express.static(path.join(__dirname, "public")));

function findUser(username, password) {
  return USERS.find(
    u => u.username === username && u.password === password
  );
}

function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

wss.on("connection", (ws) => {
  ws.username = null;

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      // Login
      if (data.type === "login") {
        const user = findUser(data.username, data.password);

        if (!user) {
          ws.send(JSON.stringify({
            type: "login_error",
            message: "نام کاربری یا رمز عبور اشتباه است."
          }));
          return;
        }

        ws.username = user.username;

        ws.send(JSON.stringify({
          type: "login_success",
          username: user.username,
          isRoyal: ROYAL_USERS.has(user.username) // 👈 پرچم تاج
        }));

        // 👇 پیام مخصوص سلطان
        if (ROYAL_USERS.has(user.username)) {
          broadcast({
            type: "system",
            message: "👑 سلطان اومد",
            royal: true
          });
        } else {
          broadcast({
            type: "system",
            message: `${user.username} وارد چت شد.`
          });
        }

        return;
      }

      if (!ws.username) return;

      // Chat message
      if (data.type === "message") {
        const text = String(data.text || "").trim();
        if (!text || text.length > 1000) return;

        broadcast({
          type: "message",
          username: ws.username,
          isRoyal: ROYAL_USERS.has(ws.username), // 👈 تاج برای ali_h
          text,
          time: new Date().toLocaleTimeString("fa-IR", {
            hour: "2-digit",
            minute: "2-digit"
          })
        });
      }
    } catch (err) {
      console.error("Invalid WebSocket message:", err.message);
    }
  });

  ws.on("close", () => {
    if (ws.username) {
      if (ROYAL_USERS.has(ws.username)) {
        broadcast({
          type: "system",
          message: "👑 سلطان از چت خارج شد",
          royal: true
        });
      } else {
        broadcast({
          type: "system",
          message: `${ws.username} از چت خارج شد.`
        });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running on http://localhost:${PORT}`);
});
