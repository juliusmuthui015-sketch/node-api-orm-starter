import express, { Application } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

// Resolve .env relative to this compiled file's directory so it works both in TS and built JS
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Import database after loading env so top-level DB config reads the populated process.env
import { initDatabase } from "../config/db.config";

const app: Application = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function bootstrap() {
  try {
    // allow skipping DB init for local dev/testing with SKIP_DB=1 or SKIP_DB=true
    const skipDb = String(process.env.SKIP_DB || '').toLowerCase();
    if (skipDb === '1' || skipDb === 'true') {
      console.warn('SKIP_DB is set — skipping database initialization');
    } else {
      await initDatabase();
      console.log("Database connection established");
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to initialize database connection", err);
    process.exit(1);
  }
}

bootstrap();

export default app;