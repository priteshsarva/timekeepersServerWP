// controller/wpBulkSafeSync.js
import fetch from "node-fetch";
import "dotenv/config";
import { DB } from "../connect.js";
import { log } from "console";

const WP_URL = process.env.WP_URL;
const WP_CONSUMER_KEY = process.env.WP_CONSUMER_KEY;
const WP_CONSUMER_SECRET = process.env.WP_CONSUMER_SECRET;

function getAuthHeader() {
  // const auth = Buffer.from(`${WP_CONSUMER_KEY}:${WP_CONSUMER_SECRET}`).toString("base64");
  // return `Basic ${auth}`;

  const username = process.env.WP_USER; // <-- add this to your .env
  const appPassword = process.env.WP_APP_PASSWORD; // <-- add this to your .env
  const token = Buffer.from(`${username}:${appPassword}`).toString("base64");
  return `Basic ${token}`;
}

function getAuthHeadertocreactbrand() {
  const username = process.env.WP_USER; // <-- add this to your .env
  const appPassword = process.env.WP_APP_PASSWORD; // <-- add this to your .env
  const token = Buffer.from(`${username}:${appPassword}`).toString("base64");
  return `Basic ${token}`;
}


// ---------------- CATEGORY HELPERS ----------------
async function getCategoryByName(name) {
  try {
    const res = await fetch(`${WP_URL}/wp-json/wc/v3/products/categories?search=${encodeURIComponent(name)}`, {
      headers: { Authorization: getAuthHeader() },
    });
    const data = await res.json();
    return data.length > 0 ? data[0] : null;
  } catch (err) {
    console.error("❌ Error fetching category:", err);
    return null;
  }
}

async function createCategory(name) {
  try {
    const res = await fetch(`${WP_URL}/wp-json/wc/v3/products/categories`, {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`✅ Category created: ${name} (ID: ${data.id})`);
      return data;
    } else {
      console.error("❌ Error creating category:", data);
      return null;
    }
  } catch (err) {
    console.error("❌ Unexpected error creating category:", err);
    return null;
  }
}

async function getOrCreateCategory(name) {
  if (!name) return null;
  let category = await getCategoryByName(name);
  if (!category) category = await createCategory(name);
  return category?.id || null;
}

// ---------------- PRODUCT HELPERS ----------------
async function getProductBySKU(sku) {
  try {
    const res = await fetch(`${WP_URL}/wp-json/wc/v3/products?sku=${sku}`, {
      headers: { Authorization: getAuthHeader() },
    });

    // Check if response is JSON
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.error(`❌ WooCommerce did not return JSON for SKU ${sku}`);
      const text = await res.text();
      console.error("Response HTML:", text.slice(0, 300)); // log first 300 chars
      return null;
    }

    const data = await res.json();
    console.log(data);
    console.log(data.length > 0 ? data[0] : null);


    return data.length > 0 ? data[0] : null;
  } catch (err) {
    console.error("❌ Error checking product:", err);
    return null;
  }
}


// async function upsertProductSafe(product) {
//   try {
//     const sku = product.productId?.toString();
//     if (!sku) {
//       console.warn(`⚠️ Skipping product — missing productId: ${product.productName}`);
//       return;
//     }

//     const existing = await getProductBySKU(sku);
//     let method = "POST";
//     let endpoint = `${WP_URL}/wp-json/wc/v3/products`;

//     if (existing) {
//       endpoint = `${WP_URL}/wp-json/wc/v3/products/${existing.id}`;
//       method = "PUT";
//       console.log(`ℹ️ Updating product ID ${existing.id}`);
//     } else {
//       console.log(`🆕 Creating new product: ${product.productName}`);
//     }

//     const categoryId = await getOrCreateCategory(product.catName);

//     let images = [];
//     try {
//       const imgs = JSON.parse(product.imageUrl);
//       images = imgs.map((src) => ({ src }));
//     } catch {
//       if (product.featuredimg) images.push({ src: product.featuredimg });
//     }

//     const regularPrice = ((product.productOriginalPrice || 0) + 1200).toString();

//     const payload = {
//       name: product.productName,
//       type: "simple",
//       regular_price: regularPrice,
//       sku,
//       description: product.productDescription || "",
//       short_description: product.productShortDescription || "",
//       categories: categoryId ? [{ id: categoryId }] : [],
//       meta_data: [
//         { key: "productFetchedFrom", value: product.productFetchedFrom },
//         { key: "videoUrl", value: product.videoUrl || "" },
//         { key: "availability", value: product.availability ? "instock" : "outofstock" },
//         { key: "productOriginalPrice", value: product.productOriginalPrice },
//         { key: "featuredimg", value: product.featuredimg },
//         { key: "imageUrl", value: product.imageUrl },
//         { key: "productBrand", value: product.productBrand },
//         { key: "productLastUpdated", value: product.productLastUpdated },
//         { key: "productDateCreation", value: product.productDateCreation},
//         { key: "productShortDescription", value: product.productShortDescription},
//         { key: "productDescription", value: product.productDescription},
//       ],
//       stock_status: product.availability ? "instock" : "outofstock",
//     };

//     // 🚫 Skip image reupload if updating
//     if (!existing) {
//       payload.images = images;
//     }

//     const res = await fetch(endpoint, {
//       method,
//       headers: {
//         Authorization: getAuthHeader(),
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(payload),
//     });

//     const data = await res.json();
//     if (res.ok) {
//       console.log(`✅ ${existing ? "Updated" : "Created"}: ${data.name} (ID: ${data.id})`);
//     } else {
//       console.error("❌ Error creating/updating product:", data);
//     }
//   } catch (err) {
//     console.error("❌ Unexpected error:", err);
//   }
// }



async function getOrCreateBrand(brandName) {
  if (!brandName) return null;

  try {
    const searchUrl = `${WP_URL}/wp-json/wp/v2/product_brand?search=${encodeURIComponent(brandName)}`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: getAuthHeader() },
    });
    const existing = await searchRes.json();

    if (existing.length > 0) {
      console.log(`🏷️ Found existing brand: ${existing[0].name} (ID: ${existing[0].id})`);
      return existing[0].id;
    }

    // Create new brand if not found
    const createRes = await fetch(`${WP_URL}/wp-json/wp/v2/product_brand`, {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: brandName }),
    });

    const newBrand = await createRes.json();

    if (createRes.ok) {
      console.log(`🆕 Created new brand: ${newBrand.name} (ID: ${newBrand.id})`);
      return newBrand.id;
    } else {
      console.error("❌ Error creating brand:", newBrand);
      return null;
    }
  } catch (err) {
    console.error("❌ Brand lookup/creation failed:", err);
    return null;
  }
}

export async function upsertProductSafe(product, productId = null) {
  console.log("triggered");


  try {
    const sku = (productId ?? product.productId)?.toString()
    if (!sku) {
      console.warn(`⚠️ Skipping product — missing productId: ${product.productName}`);
    }

    // const existing = await getProductBySKU(sku);

    // Use passed productId if available, otherwise look up by SKU
    let existing = null;
    existing = await getProductBySKU(sku);

    // if (!productId) {
    //   existing = await getProductBySKU(sku); 
    //   if (existing) productId = existing.id;
    // } else {
    //   existing = { id: productId };
    // }

    let method = "POST";
    let endpoint = `${WP_URL}/wp-json/wc/v3/products`;

    if (existing) {
      endpoint = `${WP_URL}/wp-json/wc/v3/products/${existing.id}`;
      method = "PUT";
      console.log(`ℹ️ Updating product ID ${existing.id}`);
    } else {
      console.log(`🆕 Creating new product: ${product.productName}`);
    }

    const categoryId = !existing ? await getOrCreateCategory(product.catName) : null;
    // const brandId = !existing ? await getOrCreateBrand(product.productBrand) : null;  //use while creating new
    // const brandId = existing ? await getOrCreateBrand(product.productBrand) : null;  //used while i was doing bulk update
    const brandId = existing ? await getOrCreateBrand(product.productBrand) : null;  //used while i was doing bulk update from devupdate

    let images = [];
    try {
      const imgs = JSON.parse(product.imageUrl);
      images = imgs.map((src) => ({ src }));
    } catch {
      if (product.featuredimg) images.push({ src: product.featuredimg });
    }

    const regularPrice = ((product.productOriginalPrice || 0) + 1200).toString();

    // ✅ Base payload
    const payload = {
      name: product.productName,
      type: "simple",
      sku,
      description: product.productDescription || "",
      short_description: product.productShortDescription || "",
      stock_status: product.availability ? "instock" : "outofstock",
      brands: [{ id: brandId }], // for temp
      meta_data: [
        { key: "productFetchedFrom", value: product.productFetchedFrom },
        { key: "productUrl", value: product.productUrl },
        { key: "videoUrl", value: product.videoUrl || "" },
        { key: "availability", value: product.availability ? "instock" : "outofstock" },
        { key: "productOriginalPrice", value: product.productOriginalPrice },
        { key: "featuredimg", value: product.featuredimg },
        { key: "imageUrl", value: product.imageUrl },
        { key: "productBrand", value: product.productBrand },
        { key: "productLastUpdated", value: product.productLastUpdated },
        { key: "productDateCreation", value: product.productDateCreation },
        { key: "productShortDescription", value: product.productShortDescription },
        { key: "productDescription", value: product.productDescription },
      ],
    };



    // ✅ Add price, category & brand only for new products
    if (!existing) {
      payload.regular_price = regularPrice;

      if (categoryId) payload.categories = [{ id: categoryId }];

      // Directly assign the brand for new products
      if (brandId) payload.brands = [{ id: brandId }];

      // payload.images = images;
    }


    const res = await fetch(endpoint, {
      method,
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`✅ ${existing ? "Updated" : "Created"}: ${data.name} (ID: ${data.id})`);
    } else {
      console.error("❌ Error creating/updating product:", data);
    }
  } catch (err) {
    console.error("❌ Unexpected error:", err);
  }
}



// ---------------- BULK SYNC ----------------
export async function bulkSafeSyncProducts(req, res) {
  console.log("🔄 Starting bulk sync (safe mode) from local DB → WooCommerce...");

  try {


    const rows = await new Promise((resolve, reject) => {
      const currentTimestamp = Date.now(); // Current timestamp in milliseconds
      // const oneDayAgo = currentTimestamp - 100 * 60 * 60 * 1000; // 24 hours ago in milliseconds
      const twelveAndHalfHoursAgo = currentTimestamp - 1000 * 60 * 60 * 1000; // 12.5 hours ago in milliseconds


      DB.all(
        "SELECT * FROM PRODUCTS WHERE productLastUpdated >= ? ORDER BY datetime(productLastUpdated / 1000, 'unixepoch') DESC;",
        // [oneDayAgo],
        [twelveAndHalfHoursAgo],
        (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        }
      );
    });

    console.log(`📦 Found ${rows.length} products to sync.`);

    const batchSize = 5;
    const delayMs = 1500;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      console.log(`🚀 Syncing batch ${i / batchSize + 1} (${batch.length} products)...`);

      await Promise.all(batch.map((p) => upsertProductSafe(p)));
      console.log(`✅ Batch ${i / batchSize + 1} complete. Waiting ${delayMs}ms...`);

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    console.log("🎉 Bulk safe sync complete!");
    res.send({ status: "success", message: "Bulk safe sync complete" });
  } catch (err) {
    console.error("❌ DB error:", err);
    res.status(500).send({ error: err.message });
  }
}
