import fetch from "node-fetch";
import "dotenv/config";

const WP_URL = process.env.WP_URL;
const WP_CONSUMER_KEY = process.env.WP_CONSUMER_KEY;
const WP_CONSUMER_SECRET = process.env.WP_CONSUMER_SECRET;

function getAuthHeader() {
  const auth = Buffer.from(`${WP_CONSUMER_KEY}:${WP_CONSUMER_SECRET}`).toString("base64");
  return `Basic ${auth}`;
}

// ----------------- CATEGORY FUNCTIONS -----------------

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
  let category = await getCategoryByName(name);
  if (!category) category = await createCategory(name);
  return category?.id || null;
}

// ----------------- PRODUCT FUNCTIONS -----------------

async function getProductBySKU(sku) {
  try {
    const res = await fetch(`${WP_URL}/wp-json/wc/v3/products?sku=${sku}`, {
      headers: { Authorization: getAuthHeader() },
    });
    const data = await res.json();
    return data.length > 0 ? data[0] : null;
  } catch (err) {
    console.error("❌ Error checking product:", err);
    return null;
  }
}

function areProductsEqual(existing, payload) {
  const fieldsToCompare = [
    "name", "regular_price", "description", "short_description",
  ];
  for (const key of fieldsToCompare) {
    if ((existing[key] || "") !== (payload[key] || "")) return false;
  }

  // Compare category IDs
  const existingCat = existing.categories?.[0]?.id || null;
  const newCat = payload.categories?.[0]?.id || null;
  if (existingCat !== newCat) return false;

  // Compare stock status
  if (existing.stock_status !== payload.stock_status) return false;

  // Compare images (check first image only for simplicity)
  const existingImg = existing.images?.[0]?.src || "";
  const newImg = payload.images?.[0]?.src || "";
  if (existingImg !== newImg) return false;

  return true;
}

export async function upsertProduct(product) {
  try {
    const sku = product.productId.toString();
    const existing = await getProductBySKU(sku);

    let method = "POST";
    let endpoint = `${WP_URL}/wp-json/wc/v3/products`;

    if (existing) {
      endpoint = `${WP_URL}/wp-json/wc/v3/products/${existing.id}`;
      method = "PUT";
    }

    const categoryId = await getOrCreateCategory(product.catName);

    let images = [];
    try {
      const imgs = JSON.parse(product.imageUrl);
      images = imgs.map((src) => ({ src }));
    } catch {
      if (product.featuredimg) images.push({ src: product.featuredimg });
    }

    const regularPrice = ((product.productOriginalPrice || 0) + 1200).toString();

    const payload = {
      name: product.productName,
      type: "simple",
      regular_price: regularPrice,
      sku,
      description: product.productDescription || "",
      short_description: product.productShortDescription || "",
      categories: categoryId ? [{ id: categoryId }] : [],
      images,
      stock_status: product.availability ? "instock" : "outofstock", // ✅ mark out of stock
      meta_data: [
        { key: "productFetchedFrom", value: product.productFetchedFrom },
        { key: "videoUrl", value: product.videoUrl || "" },
        { key: "productOriginalPrice", value: product.productOriginalPrice },
      ],
    };

    // ✅ Skip update if product data is identical
    if (existing && areProductsEqual(existing, payload)) {
      console.log(`⏩ Skipping product (no changes): ${product.productName} [SKU: ${sku}]`);
      return;
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
      console.log(`✅ Product ${existing ? "updated" : "created"}: ID ${data.id}`);
    } else {
      console.error("❌ Error creating/updating product:", data);
    }
  } catch (err) {
    console.error("❌ Unexpected error:", err);
  }
}

// ----------------- TEST -----------------
// (You can reuse your same test array here)
