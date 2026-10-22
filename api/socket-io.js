import http from "node:http";
import { Server } from "socket.io";
import registerChessTournamentSockets from "../utils/chessTournamentSockets.js";

const server = http.createServer();

const allowedOrigins = [
  "http://localhost:3000",
  "https://flair-chess.vercel.app",
];

const io = new Server(server, {
  path: "/api/socket-io/socket.io",
  transports: ["websocket"],
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"],
  },
});

registerChessTournamentSockets(io);

io.on("connection", (socket) => {
  console.log("Chess socket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Chess socket disconnected:", socket.id);
  });
});

export default server;