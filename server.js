// import express from "express";
// import dotenv from "dotenv";
// import cors from "cors";
// import cookieParser from "cookie-parser";
// import path from "path";
// import http from "http";
// import { fileURLToPath } from "url";
// import { dirname } from "path";
// import { Server } from "socket.io";

// import authRoutes from "./routes/authRoutes.js";
// import paymentRoutes from "./routes/paymentRoutes.js";
// import progressRoutes from "./routes/progressRoutes.js";
// import chessTournamentRoutes from "./routes/chessTournamentRoutes.js";
// import registerChessTournamentSockets from "./utils/chessTournamentSockets.js";
// import connectdb from "./db/connectdb.js";
// import userRoutes from "./routes/userRoutes.js";
// import quizRoutes from "./routes/quizRoutes.js";
// import adminRoutes from "./routes/adminRoutes.js";
// import stripe from "./utils/stripe.js";
// import { stripeWebhook } from "./controllers/paymentController.js";

// dotenv.config();

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// const app = express();
// const server = http.createServer(app);

// const PORT = process.env.PORT || 5000;

// const allowedOrigins = [
//   "http://localhost:3000",
//   "https://flair-chess.vercel.app",
//   "https://flair-olympiad-science-frontend.vercel.app",
//   "https://flair-voice-frontend.vercel.app",
//   "https://www.flairolympiad.com",
//   "https://flairolympiad.com",
// ];

// const isAllowedOrigin = (origin) =>
//   !origin || allowedOrigins.includes(origin);

// const corsOptions = {
//   origin(origin, callback) {
//     if (isAllowedOrigin(origin)) {
//       return callback(null, true);
//     }

//     console.log("CORS blocked:", origin);
//     return callback(new Error("Not allowed by CORS"));
//   },
//   credentials: true,
//   methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"],
// };
// const io = new Server(server, {
//   cors: {
//     origin(origin, callback) {
//       if (!origin || allowedOrigins.includes(origin)) {
//         return callback(null, true);
//       }

//       callback(new Error("Socket origin not allowed"));
//     },
//     credentials: true,
//     methods: ["GET", "POST"],
//   },
// });

// registerChessTournamentSockets(io);
// app.set("io", io);

// // Stripe requires the raw body for webhook signature verification.
// // Keep this before express.json().
// app.post(
//   "/api/payment/webhook",
//   express.raw({ type: "application/json" }),
//   stripeWebhook
// );

// app.use(cors(corsOptions));
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(cookieParser());

// // Existing routes
// app.get("/test", (req, res) => {
//   res.json({ message: "app is working" });
// });

// app.get("/", (req, res) => {
//   res.send("Flair Olympiad API running");
// });

// app.get("/stripe-test", async (req, res) => {
//   try {
//     const balance = await stripe.balance.retrieve();
//     res.json(balance);
//   } catch (error) {
//     res.status(500).json({ message: "Could not retrieve Stripe balance." });
//   }
// });

// app.use("/api/admin", adminRoutes);
// app.use("/api/users", userRoutes);
// app.use("/api/auth", authRoutes);
// app.use("/api/quiz", quizRoutes);
// app.use("/api/quiz/progress", progressRoutes);
// app.use("/api/chess/tournaments", chessTournamentRoutes);

// app.use("/img", express.static(path.join(__dirname, "img")));
// app.use("/api/payment", paymentRoutes);


// // Temporary connection setup only.
// // Do not accept chess moves until authentication, tournament
// // membership, pairing, turn, and legal-move checks are implemented.
// io.on("connection", (socket) => {
//   console.log("Chess socket connected:", socket.id);

//   socket.on("disconnect", () => {
//     console.log("Chess socket disconnected:", socket.id);
//   });
// });

// async function startServer() {
//   try {
//     await connectdb();

//     server.listen(PORT, () => {
//       console.log(`Server is running on port ${PORT}`);
//       console.log("Socket.IO is ready");
//     });
//   } catch (error) {
//     console.error("Failed to start server:", error);
//     process.exit(1);
//   }
// }


// startServer();



import { createServer } from "node:http";
import connectdb from "./db/connectdb.js";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import chessTournamentRoutes from "./routes/chessTournamentRoutes.js"
import registerChessTournamentSockets from "./utils/chessTournamentSockets.js";
import { Server } from "socket.io";
import authRoutes from "./routes/authRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import progressRoutes from "./routes/progressRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

import { stripeWebhook } from "./controllers/paymentController.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();



/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

const allowedOrigins = [
  "http://localhost:3000",
  "https://flair-chess.vercel.app",
  "https://flair-olympiad-science-frontend.vercel.app",
  "https://flair-voice-frontend.vercel.app",
  "https://www.flairolympiad.com",
  "https://flairolympiad.com",
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests without Origin
    // such as server-to-server requests
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log("CORS blocked:", origin);

    return callback(new Error("Not allowed by CORS"));
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
  ],
};

app.use(cors(corsOptions));

app.options(/.*/, cors(corsOptions));

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});


const server = http.createServer(app);


const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket"],
});



registerChessTournamentSockets(io);
app.set("io", io);

/*
|--------------------------------------------------------------------------
| Stripe Webhook
|--------------------------------------------------------------------------
| Must come before express.json()
|--------------------------------------------------------------------------
*/

app.post(
  "/api/payment/webhook",
  express.raw({
    type: "application/json",
  }),
  stripeWebhook
);

/*
|--------------------------------------------------------------------------
| Body Parsers
|--------------------------------------------------------------------------
*/

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/*
|--------------------------------------------------------------------------
| Test
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Flair Olympiad API running",
  });
});

app.get("/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is working",
  });
});

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/



app.use("/api/admin", adminRoutes);

app.use("/api/users", userRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/quiz", quizRoutes);

app.use("/api/quiz/progress", progressRoutes);

app.use("/api/payment", paymentRoutes);
app.use("/api/chess/tournaments",chessTournamentRoutes);
/*
|--------------------------------------------------------------------------
| Static Images
|--------------------------------------------------------------------------
*/

app.use(
  "/img",
  express.static(path.join(__dirname, "img"))
);

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

/*
|--------------------------------------------------------------------------
| Error Handler
|--------------------------------------------------------------------------
*/

app.use((err, req, res, next) => {
  console.error("API Error:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

/*
|--------------------------------------------------------------------------
| IMPORTANT
|--------------------------------------------------------------------------
| No app.listen() on Vercel
|--------------------------------------------------------------------------
*/
io.on("connection", (socket) => {
  console.log("Chess socket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Chess socket disconnected:", socket.id);
  });
});
export default server;