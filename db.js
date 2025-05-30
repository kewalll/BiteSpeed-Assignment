import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Client } = pkg;

const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

await db.connect();
console.log("Connected to PostgreSQL on Render");

export default db;
