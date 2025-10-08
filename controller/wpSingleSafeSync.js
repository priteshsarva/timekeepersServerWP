import fetch from "node-fetch";
import "dotenv/config";
import { DB } from "../connect.js";
import { addProductToDatabase, updateProduct } from "./newtemp.js";

const WP_URL = process.env.WP_URL;
const WP_CONSUMER_KEY = process.env.WP_CONSUMER_KEY;
const WP_CONSUMER_SECRET = process.env.WP_CONSUMER_SECRET;

function getAuthHeader() {
  const auth = Buffer.from(`${WP_CONSUMER_KEY}:${WP_CONSUMER_SECRET}`).toString("base64");
  return `Basic ${auth}`;
}

// ---------------- CATEGORY HELPERS ----------------
async function getCategoryByName(name) {
  if (!name) return null;
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
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.error(`❌ WooCommerce did not return JSON for SKU ${sku}`);
      const text = await res.text();
      console.error("Response HTML:", text.slice(0, 300));
      return null;
    }
    const data = await res.json();
    return data.length > 0 ? data[0] : null;
  } catch (err) {
    console.error("❌ Error checking product:", err);
    return null;
  }
}

// ---------------- SAFE UPSERT (LOCAL + WP) ----------------
export async function upsertSingleProduct(product) {
  try {
    // // 1️⃣ Check if product exists locally
    // let dbProduct = await new Promise((resolve) => {
    //   DB.get(
    //     `SELECT * FROM PRODUCTS WHERE productUrl = ?`,
    //     [product.productUrl],
    //     (err, row) => {
    //       if (err) {
    //         console.error("❌ DB check error:", err);
    //         resolve(null);
    //       } else resolve(row);
    //     }
    //   );
    // });

    // // 2️⃣ Insert or update locally
    // if (!dbProduct) {
    //   console.log(`🆕 Local product not found — inserting new: ${product.productName}`);
    //   const newId = await addProductToDatabase(product);
    //   dbProduct = { ...product, productId: newId };
    // } else {
    //   console.log(`🟡 Local product exists — updating: ${dbProduct.productName}`);
    //   await updateProduct(product);
    // }

    // const sku = dbProduct.productId?.toString();
    // if (!sku) {
    //   console.warn(`⚠️ Skipping product — missing productId after insert: ${product.productName}`);
    //   return;
    // }

    const sku= product.productId

    // 3️⃣ Check if product exists in WooCommerce
    const existing = await getProductBySKU(sku);
    let method = "POST";
    let endpoint = `${WP_URL}/wp-json/wc/v3/products`;

    if (existing) {
      endpoint = `${WP_URL}/wp-json/wc/v3/products/${existing.id}`;
      method = "PUT";
      console.log(`ℹ️ Updating WooCommerce product ID ${existing.id}`);
    } else {
      console.log(`🆕 Creating new WooCommerce product: ${product.productName}`);
    }

    // 4️⃣ Prepare payload
    const categoryId = await getOrCreateCategory(product.catName);

    // Handle images safely
    let images = [];
    try {
      const imgs = Array.isArray(product.imageUrl)
        ? product.imageUrl
        : JSON.parse(product.imageUrl || "[]");
      if (imgs?.length) images = imgs.map((src) => ({ src }));
    } catch {
      if (product.featuredimg) images.push({ src: product.featuredimg });
    }

    const inStock =
      product.availability && product.availability !== "0" && product.availability !== false;
    const stockStatus = inStock ? "instock" : "outofstock";

    const regularPrice = ((parseFloat(product.productOriginalPrice) || 0) + 1200).toString();

    const payload = {
      name: product.productName,
      type: "simple",
      regular_price: regularPrice,
      sku,
      description: product.productDescription || "",
      short_description: product.productShortDescription || "",
      categories: categoryId ? [{ id: categoryId }] : [],
      stock_status: stockStatus,
      meta_data: [
        { key: "productFetchedFrom", value: product.productFetchedFrom },
        { key: "videoUrl", value: product.videoUrl || "" },
        { key: "availability", value: stockStatus },
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

    // Only add images when creating new product
    if (!existing) payload.images = images;

    // 5️⃣ Push to WooCommerce
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
      console.log(
        `✅ ${existing ? "Updated" : "Created"} WooCommerce product: ${data.name} (ID: ${data.id})`
      );
    } else {
      console.error("❌ WooCommerce API error:", data);
    }
  } catch (err) {
    console.error("❌ Unexpected error in upsertSingleProduct:", err);
  }
}
