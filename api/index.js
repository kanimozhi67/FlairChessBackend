
// import { app } from "../server.js";
// import connectdb from "../db/connectdb.js";

// const allowedOrigins = [
//   "http://localhost:3000",
//   "https://flair-chess.vercel.app",
//   "https://flair-olympiad-science-frontend.vercel.app",
//   "https://flair-voice-frontend.vercel.app",
//   "https://www.flairolympiad.com",
//   "https://flairolympiad.com",
// ];

// export default async function handler(req, res) {
//   const origin = req.headers.origin;

//   // Set CORS headers before any operation that can fail.
//   if (origin && allowedOrigins.includes(origin)) {
//     res.setHeader("Access-Control-Allow-Origin", origin);
//     res.setHeader("Vary", "Origin");
//   }

//   res.setHeader("Access-Control-Allow-Credentials", "true");
//   res.setHeader(
//     "Access-Control-Allow-Methods",
//     "GET,POST,PUT,PATCH,DELETE,OPTIONS"
//   );
//   res.setHeader(
//     "Access-Control-Allow-Headers",
//     "Content-Type, Authorization"
//   );

//   // Finish preflight without connecting to MongoDB.
//   if (req.method === "OPTIONS") {
//     return res.status(204).end();
//   }

//   try {
//     // Connect here only if your Express middleware does not
//     // already connect to MongoDB for this request.
//     await connectdb();

//     // Vercel Node functions receive a Node request/response.
//     // This is the Express app, not the HTTP server instance.
//     return app(req, res);
//   } catch (error) {
//     console.error("Vercel Function Error:", error);

//     if (res.headersSent) {
//       return;
//     }

//     return res.status(500).json({
//       success: false,
//       message: "Server error",
//     });
//   }
// }
import server from "../server.js";

export default server;