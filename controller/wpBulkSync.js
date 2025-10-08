// controller/wpBulkSync.js
import sqlite3 from "sqlite3";
import { upsertProduct } from "./wpProduct.js";

sqlite3.verbose();
// const DB = new sqlite3.Database("./your-database-path.db"); // 👈 update path if needed
import { DB } from "../connect.js";

// Helper function: wait for delay (to avoid rate limits)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Process in batches for performance
async function processInBatches(items, batchSize, processFn) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map((item) => processFn(item)));
    console.log(`✅ Synced batch ${i / batchSize + 1}/${Math.ceil(items.length / batchSize)}`);
    await delay(500); // small delay between batches to avoid server overload
  }
}

export async function bulkSyncProducts(req, res) {
  try {
    console.log("🔄 Starting bulk sync from local DB → WooCommerce...");

    const sql = `SELECT * FROM PRODUCTS ORDER BY productDateCreation DESC;`;

    DB.all(sql, [], async (err, rows) => {
      if (err) {
        console.error("❌ DB error:", err);
        return res.status(500).json({ error: err.message });
      }

      console.log(`📦 Found ${rows.length} products to sync.`);

      let success = 0;
      let failed = 0;
      let skipped = 0;

      // Optional: if you have a "sync" flag in DB, skip already synced ones
      const processProduct = async (product) => {
        try {
          // Check valid SKU
          if (!product.productId) {
            console.warn(`⚠️ Skipping product — missing productId: ${product.productName}`);
            skipped++;
            return;
          }

          await upsertProduct(product);
          success++;
        } catch (error) {
          failed++;
          console.error(`❌ Failed to sync product ID ${product.productId}: ${error.message}`);
        }
      };

      await processInBatches(rows, 10, processProduct); // sync 10 at once

      console.log("✅ Bulk sync complete!");
      res.json({ message: "Bulk sync complete", success, failed, skipped, total: rows.length });
    });
  } catch (err) {
    console.error("❌ Unexpected error in bulkSyncProducts:", err);
    res.status(500).json({ error: err.message });
  }
}
