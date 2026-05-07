import "dotenv/config";
import express from "express";
import cors from "cors";
import identifyRouter from "./routes/identify";
import searchRouter from "./routes/search";
import equipmentRouter from "./routes/equipment";
import feedbackRouter from "./routes/feedback";
import videosRouter from "./routes/videos";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api/identify", identifyRouter);
app.use("/api/search", searchRouter);
app.use("/api/equipment", equipmentRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/videos", videosRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`GymLens server running on http://localhost:${PORT}`);
});

export default app;
