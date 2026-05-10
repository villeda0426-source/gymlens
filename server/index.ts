import "./polyfills"; // must be first — sets up WebSocket before any Supabase client initializes
import "dotenv/config";
import express from "express";
import cors from "cors";
import identifyRouter from "./routes/identify";
import searchRouter from "./routes/search";
import equipmentRouter from "./routes/equipment";
import feedbackRouter from "./routes/feedback";
import videosRouter from "./routes/videos";

const app = express();

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api/identify", identifyRouter);
app.use("/api/search", searchRouter);
app.use("/api/equipment", equipmentRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/videos", videosRouter);

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`CoachLift server running on 0.0.0.0:${PORT}`);
});

export default app;
