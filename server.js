
const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const app = express();
app.set("trust proxy", 1);
// ==============================
// CHAT USERS
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
  { username: "user10", password: "pass10" },

  // Special user
  { username: "ali_h", password: "zxcasdqwe12" }
];

app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));

  return aBuf.length === bBuf.length &&
    crypto.timingSafeEqual(aBuf, bBuf);
}

function signSession(expiry) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(`site-auth:${expiry}`)
    .digest("hex");
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;

    const key = part.slice(0, index).trim();

    if (key === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }

  return null;
}

function isSiteAuthenticated(req) {
  if (!SITE_PASSWORD || !SESSION_SECRET) return false;

  const token = getCookie(req, "site_auth");
  if (!token) return false;

  const [expiryText, signature, extra] = token.split(".");

  if (!expiryText || !signature || extra !== undefined) {
    return false;
  }

  const expiry = Number(expiryText);

  if (
    !Number.isSafeInteger(expiry) ||
    expiry <= Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  return safeEqual(signature, signSession(expiry));
}

function loginPage(errorMessage = "") {
  const error = errorMessage
    ? `<p class="error">${errorMessage}</p>`
    : "";

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>ورود | Private-Chat</title>

  <style>
    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 20px;
      background: #10131c;
      color: #f4f5f8;
      font-family: Tahoma, Arial, sans-serif;
    }

    .panel {
      width: 100%;
      max-width: 390px;
      padding: 32px 26px;
      border: 1px solid #303747;
      border-radius: 18px;
      background: #191f2b;
      box-shadow: 0 18px 55px #0006;
      text-align: center;
    }

    .lock {
      font-size: 42px;
      margin-bottom: 12px;
    }

    h1 {
      margin: 0 0 10px;
      font-size: 23px;
    }

    p {
      color: #aeb8c8;
      line-height: 1.8;
      font-size: 14px;
    }

    input {
      width: 100%;
      padding: 14px;
      margin: 12px 0;
      border: 1px solid #414c60;
      border-radius: 10px;
      background: #101621;
      color: white;
      font-size: 16px;
      outline: none;
    }

    input:focus {
      border-color: #8b70ff;
    }

    button {
      width: 100%;
      padding: 14px;
      border: 0;
      border-radius: 10px;
      background: #7657e8;
      color: white;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
    }

    button:hover {
      background: #6848d7;
    }

    .error {
      color: #ff9292;
      margin: 4px 0 10px;
    }
  </style>
</head>

<body>
  <main class="panel">
    <div class="lock">🔒</div>
    <h1>Private-Chat</h1>
    <p>برای ورود به سایت، رمز عبور را وارد کنید.</p>

    ${error}

    <form method="POST" action="/__site_login">
      <input
        type="password"
        name="password"
        placeholder="رمز عبور سایت"
        autocomplete="current-password"
        required
        autofocus
      >

      <button type="submit">ورود به سایت</button>
    </form>
  </main>
</body>
</html>`;
}

// Login page
app.get("/__site_login", (req, res) => {
  if (isSiteAuthenticated(req)) {
    return res.redirect("/");
  }

  res.status(200).type("html").send(loginPage());
});

// Check site password
app.post("/__site_login", (req, res) => {
  if (!SITE_PASSWORD || !SESSION_SECRET) {
    return res.status(503).send(
      "Site password is not configured."
    );
  }

  const submittedPassword = String(req.body.password || "");

  if (!safeEqual(submittedPassword, SITE_PASSWORD)) {
    return res.status(401).type("html").send(
      loginPage("رمز عبور اشتباه است.")
    );
  }

  const expiry =
    Math.floor(Date.now() / 1000) + SESSION_SECONDS;

  const token = `${expiry}.${signSession(expiry)}`;

  const isHttps =
    req.secure ||
    req.headers["x-forwarded-proto"] === "https";

  res.cookie("site_auth", token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS * 1000
  });

  return res.redirect(303, "/");
});

// Protect all pages and files
app.use((req, res, next) => {
  if (!SITE_PASSWORD || !SESSION_SECRET) {
    return res.status(503).send(
      "Site password is not configured."
    );
  }

  if (!isSiteAuthenticated(req)) {
    if (req.method === "GET" || req.method === "HEAD") {
      return res.status(401).type("html").send(loginPage());
    }

    return res.status(401).send(
      "برای دسترسی به سایت ابتدا وارد شوید."
    );
  }

  next();
});

// Website files
app.use(express.static(path.join(__dirname, "public"), {
  index: ["index.html"],
  dotfiles: "deny"
}));

function findUser(username, password) {
  return USERS.find(
    u => u.username === username &&
         u.password === password
  );
}

// Broadcast messages
function broadcast(data) {
  const message = JSON.stringify(data);

  wss.clients.forEach(client => {
    if (
      client.readyState === 1 &&
      client.siteAuthenticated
    ) {
      client.send(message);
    }
  });
}

// WebSocket protection
const wss = new WebSocketServer({
  server,
  verifyClient: (info, done) => {
    const req = info.req;

    done(
      isSiteAuthenticated(req),
      401,
      "Site login required"
    );
  }
});

// Chat system
wss.on("connection", (ws) => {
  ws.siteAuthenticated = true;
  ws.username = null;

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      // Chat login
      if (data.type === "login") {
        const user = findUser(
          data.username,
          data.password
        );

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
          username: user.username
        }));

        // Special system message for ali_h
        broadcast({
          type: "system",
          message: user.username === "ali_h"
            ? "سلطان وارد شد"
            : `${user.username} وارد چت شد.`
        });

        return;
      }

      // Ignore messages from unauthenticated chat users
      if (!ws.username) return;

      // Chat message
      if (data.type === "message") {
        const text = String(data.text || "").trim();

        if (!text || text.length > 1000) return;

        broadcast({
          type: "message",
          username: ws.username,
          text,
          time: new Date().toLocaleTimeString("fa-IR", {
            hour: "2-digit",
            minute: "2-digit"
          })
        });
      }

    } catch (err) {
      console.error(
        "Invalid WebSocket message:",
        err.message
      );
    }
  });

  ws.on("close", () => {
    if (ws.username) {
      broadcast({
        type: "system",
        message: `${ws.username} از چت خارج شد.`
      });
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
