import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import { DB } from '../connect.js';
import fs from 'fs';
import path, { resolve } from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { rejects } from 'assert';
import "dotenv/config";
import { exec } from 'child_process';
import { humanizePage, humanType } from './humanize.js';
import { log } from 'console';
import { upsertProductSafe } from './wpBulkSafeSync.js'

// const baseUrls = ['https://oneshoess.cartpe.in', 'https://reseller-store.cartpe.in'];
// const baseUrls = ['https://oneshoess.cartpe.in'];


// Use the stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

// Promisify DB methods for easier async/await usage
DB.run = promisify(DB.run);
DB.get = promisify(DB.get);

// Utility function to introduce delays
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get the current directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Function to download images
async function downloadImage(url, folderPath) {
    try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const fileName = path.basename(url);
        const filePath = path.join(folderPath, fileName);

        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, Buffer.from(buffer));
            console.log(`Downloaded: ${fileName}`);
        } else {
            console.log(`File already exists: ${fileName}`);
        }

        return filePath;
    } catch (error) {
        console.error(`Error downloading image: ${url}`, error);
        return null;
    }
}

// Utility function to get the first two words of a string
function getFirstTwoWords(inputString) {
    const words = inputString.split(' ');
    return words.slice(0, 2).join(' ');
}
function gitAutoCommitAndPush() {
    const now = new Date();
    const dateTimeString = now.toISOString().replace('T', ' ').split('.')[0]; // Format: YYYY-MM-DD HH:mm:ss
    const commitMessage = `DB updated on ${dateTimeString}`;

    // Step 1: Add all changes
    exec('git add .', (err) => {
        if (err) {
            console.error('❌ Error adding files:', err);
            return;
        }
        console.log('✅ Changes staged.');

        // Step 2: Commit with message
        exec(`git commit -m "${commitMessage}"`, (err) => {
            if (err) {
                if (err.message.includes('nothing to commit')) {
                    console.log('ℹ️ No changes to commit.');
                    return;
                }
                console.error('❌ Error committing:', err);
                return;
            }
            console.log('✅ Changes committed.');

            // Step 3: Pull before pushing to avoid remote conflicts
            exec('git pull --rebase', (err, stdout, stderr) => {
                if (err) {
                    console.error('❌ Error pulling from remote:', stderr || err);
                    return;
                }
                console.log('✅ Pulled latest changes from remote.');

                // Step 4: Push to remote
                exec('git push', (err) => {
                    if (err) {
                        console.error('❌ Error pushing to remote:', err);
                        return;
                    }
                    console.log('✅ Changes pushed to remote repository.');
                });
            });
        });
    });
}

// Main function to fetch data
async function fetchDataa(baseUrls) {
    console.log(Date.now());
    gitAutoCommitAndPush();



    const browser = await puppeteer.launch({
        headless: process.env.PUPPETEER_HEADLESS === 'true',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
        defaultViewport: { width: 1080, height: 800 },
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--no-zygote',
            '--window-size=1080,800',
            '--start-maximized'
        ]
    });

    const page = await browser.newPage();

    // ✅ Use realistic headers
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.9',
        'upgrade-insecure-requests': '1'
    });

    // ✅ Optional: add random delay to look human
    await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 2000) + 1000));


    ///old code--------------------------------------
    // while (true) {
    // const browser = await puppeteer.launch({
    //     //old
    //     // executablePath: '/usr/bin/chromium', // for server
    //     // executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),

    //     // headless: true, // Ensures stability in recent Puppeteer versions
    //     defaultViewport: { width: 1080, height: 800 },
    //     args: [
    //         "--no-sandbox",
    //         "--disable-setuid-sandbox",
    //         // "--single-process",
    //         "--no-zygote",
    //         "--disable-dev-shm-usage",
    //         "--disable-accelerated-2d-canvas",
    //         "--disable-gpu"
    //     ],
    //     //new
    //     headless: process.env.PUPPETEER_HEADLESS === 'true', // Convert string to boolean
    //     executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
    // });
    // const page = await browser.newPage();
    // await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const allproducts = [];

    // Use a for...of loop to handle asynchronous operations
    for (const url of baseUrls) {
        const fullUrl = `${url}/allcategory.html`;
        let productss = []; // Initialize productss for each URL

        try {
            // Scrape categories from the current URL
            const categories = await scrapeCategories(page, fullUrl);
            // Scrape products for each category
            productss = await scrapeProducts(page, categories, url); // Pass the base URL here
        } catch (error) {
            console.error(`Error fetching data from ${url}:`, error);
        } finally {
            // Add scraped products to the final array
            allproducts.push(...productss); // Use spread operator to flatten the array
        }
    }


    // Close the browser after scraping all URLs
    await browser.close();



    // Call the function when your task is done
    gitAutoCommitAndPush();
    console.log("finished");
    console.log(Date.now());
    return allproducts;
    // }
}

// Function to scrape categories
async function scrapeCategories(page, fullUrl, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            // Navigate to the category page
            await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 60000 });

            // Extract category data
            const categories = await page.evaluate(() => {
                const categoryElements = document.querySelectorAll('.cat-area');
                return Array.from(categoryElements).map(element => ({
                    catTitle: element.querySelector('.cat-text').innerText,
                    catimg: element.querySelector('img').src,
                    caturl: element.querySelector('a').href,
                }));
            });

            // Add categories to the database
            for (const cat of categories) {
                const catExists = await DB.get(`SELECT catId FROM CATEGORIES WHERE catName = ?`, [cat.catTitle]);
                if (!catExists) {
                    await DB.run(`INSERT INTO CATEGORIES (catName, catImg, catSlug) VALUES (?, ?, ?)`, [cat.catTitle, cat.catimg, cat.caturl]);
                    console.log(`Added category: ${cat.catTitle}`);
                }
            }

            return categories;
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error.message);
            if (i === retries - 1) throw error; // Throw error if all retries fail
            await delay(5000); // Wait 5 seconds before retrying
        }
    }
}

// Function to scrape products
async function scrapeProducts(page, categories, baseUrl) {
    const products = [];
    await humanizePage(page, { mouseMoves: 3 });
    // Loop through each category
    for (const cat of categories) {
        const catProductss = []
        const productUrl = cat.caturl;
        try {
            // Navigate to the product page
            await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 120000 }); // Increase timeout to 120 seconds
            await page.waitForSelector('.single-product', { timeout: 60000 }); // Increase timeout

            // Get the total number of products
            const productCount = await page.evaluate(() => {
                return document.querySelector('#total_result_cnt')?.innerText || 0;
            });
            await viewMore(page, productCount)
            console.log("After view more");

            const productElements = await page.evaluate(() => {
                const elements = document.querySelectorAll('.single-product');
                return Array.from(elements).map(element => {

                    let availability = false;
                    const buttonText = element.querySelector('button')?.innerText.trim().toLowerCase();

                    if (buttonText === 'add to cart') {
                        availability = true;
                    } else {
                        availability = false;
                    }

                    const button = element.querySelector('.product-details > div > button');
                    const sizes = button && button.innerText.trim() === 'Add to Cart'
                        ? Array.from(element.querySelectorAll('.product-details > div > div > label'))
                            .slice(1)
                            .map(label => label.innerText.trim())
                        : [];

                    return {
                        title: element.querySelector('.product-details > a > h6')?.innerText.trim(),
                        price: element.querySelector('.product-details > div > h6:nth-child(1)')?.innerText.trim(),
                        featuredimg: element.querySelector('.product-img-block img')?.src,
                        detailUrl: element.querySelector('.product-img-block img')?.parentElement.getAttribute('href'),
                        availability: availability,
                        sizes: Array.from(element.querySelectorAll('.product-details > div > div > label'))
                            .slice(1) // Skip the first label if it's not a size
                            .map(label => label.innerText.trim()),
                    };
                });
            });

            // console.log(productElements);

            // Scrape images and descriptions for each product
            for (const product of productElements) {
                const { imageSlides, productShortDescription, videoURL } = await scrapeImages(page, product.detailUrl);
                const result = getFirstTwoWords(product.title);

                // Download images and get local paths
                const imageFolder = path.join(__dirname, 'images', result.replace(/\s+/g, '_'));
                if (!fs.existsSync(imageFolder)) {
                    fs.mkdirSync(imageFolder, { recursive: true });
                }

                // const localImagePaths = [];
                // for (const imageUrl of imageSlides) {
                //     const localPath = await downloadImage(imageUrl, imageFolder);
                //     if (localPath) {
                //         localImagePaths.push(localPath);
                //     }
                // }

                // Add product to database
                catProductss.push({
                    productName: product.title,
                    productOriginalPrice: product.price,
                    productBrand: result,
                    featuredimg: product.featuredimg,
                    sizeName: product.sizes.map(String),
                    productUrl: product.detailUrl,
                    // imageUrl: localImagePaths,
                    imageUrl: imageSlides, //for img link
                    videoUrl: videoURL,
                    productShortDescription,
                    catName: cat.catTitle,
                    productFetchedFrom: baseUrl,
                    availability: product.availability
                });
            }



        } catch (error) {
            console.error(`Error scraping products frommmmmm ${productUrl}:`, error.message);
        }

        try {
            console.log("from try block");
            for (const eachproduct of catProductss) {
                const productId = await updateProduct(eachproduct);
                await upsertProductSafe(eachproduct, productId);
                console.log("From Each Product");
            }
            products.push(...catProductss)
            console.log("All products processed.");
            // Enable network domain to control cache
            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCache');
            await client.send('Network.clearBrowserCookies');

            console.log("Cache and cookies cleared!");
            // const productId = await addProductToDatabase(productData);

            // Add many-to-many relationships
            // await addProductRelationships(productId, productData);

        } catch (error) {
            console.error(`Error adding product to database:`, error.message);
        }

    }

    // console.log([[products.length , url]]);

    // return [[products.length , url]];
    return products;
}

// old
// Function to add product to database
// async function addProductToDatabase(product) {
//     console.log("from add product");
//     console.log(product);

//     try {
//         const sql = `INSERT INTO PRODUCTS (
//             productName, productOriginalPrice, productBrand, featuredimg, sizeName, productUrl, imageUrl, productShortDescription, catName, productFetchedFrom
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

//         // Execute the INSERT query
//         await DB.run(sql, [
//             product.productName,
//             product.productOriginalPrice,
//             product.productBrand,
//             product.featuredimg,
//             JSON.stringify(product.sizeName),
//             product.productUrl,
//             JSON.stringify(product.imageUrl),
//             product.productShortDescription,
//             product.catName,
//             product.productFetchedFrom
//         ]);

//         // Get the last inserted row ID
//         const row = await DB.get(`SELECT last_insert_rowid() as lastID`);
//         const lastID = row.lastID;

//         if (!lastID) {
//             throw new Error('Failed to retrieve last inserted ID');
//         }

//         console.log('Inserted product with ID:', lastID);
//         return lastID;
//     } catch (error) {
//         console.error('Error adding product to database:', error.message);
//         throw error; // Re-throw the error to handle it in the calling function
//     }
// }

async function addProductToDatabase(product) {
    console.log("from add product");
    console.log(product);

    try {
        const sql = `INSERT INTO PRODUCTS (
            productName, productOriginalPrice, productBrand, featuredimg, 
            sizeName, productUrl, imageUrl, videoUrl, availability, productShortDescription, 
            catName, productFetchedFrom, productLastUpdated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        // ✅ Wrap DB.run in Promise
        await new Promise((resolve, reject) => {
            DB.run(sql, [
                product.productName,
                product.productOriginalPrice,
                product.productBrand,
                product.featuredimg,
                JSON.stringify(product.sizeName),
                product.productUrl,
                JSON.stringify(product.imageUrl),
                product.videoUrl,
                product.availability,
                product.productShortDescription,
                product.catName,
                product.productFetchedFrom,
                Date.now()
            ], function (err) {
                if (err) reject(err);
                else resolve(this.lastID); // resolve immediately with inserted ID
            });
        });

        // ✅ Wrap DB.get in Promise to fetch last inserted rowid
        const row = await new Promise((resolve, reject) => {
            DB.get(`SELECT last_insert_rowid() as lastID`, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        const lastID = row.lastID;
        console.log("Last inserted ID:", lastID);

        if (!lastID) throw new Error('Failed to retrieve last inserted ID');



        console.log('✅ Inserted product with ID:', lastID);
        return lastID;

    } catch (error) {
        console.error('❌ Error adding product to database:', error.message);
        throw error;
    }
}



// Function to add many-to-many relationships
async function addProductRelationships(productId, product) {

    // Add product-category relationship
    const catRow = await DB.get(`SELECT catId FROM CATEGORIES WHERE catName = ?`, [product.catName]);
    if (catRow) {
        await DB.run(`INSERT OR IGNORE INTO ProductCategories (ProductId, CategoryId) VALUES (?, ?)`, [productId, catRow.catId]);
    }


    await realtiontosize(productId, product)
    await relationToBrand(productId, product)

}

async function realtiontosize(productId, product) {
    console.log("product size ");
    console.log(product.sizeName);

    // Add product-sizes relationships

    for (const size of product.sizeName) {
        console.log("from size for");

        try {
            // Insert size if it doesn't exist
            const sizesql = `INSERT INTO SIZES (sizeName) VALUES (?) ON CONFLICT(sizeName) DO NOTHING;`;
            await DB.run(sizesql, [size]);

            // Get the sizeId of the inserted or existing size
            const sizeRow = await DB.get(`SELECT sizeId FROM SIZES WHERE sizeName = ?`, [size]);

            if (sizeRow) {
                console.log(`Size ID for "${size}":`, sizeRow.sizeId);

                // Add product-size relationship
                await DB.run(
                    `INSERT OR IGNORE INTO ProductSizes (ProductId, SizeId) VALUES (?, ?)`,
                    [productId, sizeRow.sizeId]
                );
            } else {
                console.error(`Size "${size}" not found in the database.`);
            }
        } catch (err) {
            console.error(`Error processing size "${size}":`, err.message);
        }
    }
}
async function relationToBrand(productId, product) {
    console.log("product productBrand ");
    console.log(product.productBrand);

    // Add product-sizes relationships

    const productBrand = product.productBrand

    try {
        // Insert size if it doesn't exist
        const sizesql = `INSERT INTO BRAND (brandName) VALUES (?) ON CONFLICT(brandName) DO NOTHING;`;
        await DB.run(sizesql, [productBrand]);

        // Get the sizeId of the inserted or existing size
        const sizeRow = await DB.get(`SELECT brandId FROM BRAND WHERE brandName = ?`, [productBrand]);

        if (sizeRow) {

            // Add product-size relationship
            await DB.run(
                `INSERT OR IGNORE INTO ProductBrand (ProductId, BrandId) VALUES (?, ?)`,
                [productId, sizeRow.brandId]
            );
        } else {
            console.error(`Size "${productBrand}" not found in the database.`);
        }
    } catch (err) {
        console.error(`Error processing size "${productBrand}":`, err.message);
    }

}


// async function updatproduct(product) {
//     console.log('from updatproduct');

//     const query = `SELECT productId FROM PRODUCTS WHERE productUrl = ?`;
//     try {
//         // Step 1: Select the productid based on the producturl
//         await DB.get(query, [product.productUrl], async (err, row) => {
//             if (err) {
//                 return console.error(err.message);
//             }
//             console.log(`row : ${row}`);


//             if (row) {
//                 const productId = row.productid;


//                 // Step 2: Update all values where productid matches



//                 let query = 'UPDATE PRODUCTS SET ';
//                 const updates = []
//                 const values = []

//                 if (typeof product.productName !== 'undefined') {
//                     updates.push(`productName = ?`);
//                     values.push(product.productName);
//                 }
//                 if (typeof product.productPrice !== 'undefined') {
//                     updates.push(`productPrice = ?`);
//                     values.push(product.productPrice);
//                 }
//                 if (typeof product.productPriceWithoutDiscount !== 'undefined') {
//                     updates.push(`productPriceWithoutDiscount = ?`);
//                     values.push(product.productPriceWithoutDiscount);
//                 }
//                 if (typeof product.productOriginalPrice !== 'undefined') {
//                     updates.push(`productOriginalPrice = ?`);
//                     values.push(product.productOriginalPrice);
//                 }
//                 if (typeof product.productFetchedFrom !== 'undefined') {
//                     updates.push(`productFetchedFrom = ?`);
//                     values.push(product.productFetchedFrom);
//                 }
//                 if (typeof product.ProductUrl !== 'undefined') {
//                     updates.push(`ProductUrl = ?`);
//                     values.push(product.ProductUrl);
//                 }
//                 if (typeof product.productShortDescription !== 'undefined') {
//                     updates.push(`productShortDescription = ?`);
//                     values.push(product.productShortDescription);
//                 }
//                 if (typeof product.productDescription !== 'undefined') {
//                     updates.push(`productDescription = ?`);
//                     values.push(product.productDescription);
//                 }
//                 if (typeof product.productBrand !== 'undefined') {
//                     updates.push(`productBrand = ?`);
//                     values.push(product.productBrand);
//                 }
//                 if (typeof product.productLastUpdated !== 'undefined') {
//                     updates.push(`productLastUpdated = ?`);
//                     values.push(product.productLastUpdated);
//                 } else {
//                     updates.push(`productLastUpdated = ?`);
//                     values.push(Date.now());
//                 }

//                 let sql = query += updates.join(', ') + ' WHERE productId = ?';

//                 try {
//                     await DB.run(sql, [...values, productId], function (err) {
//                         console.log("updated");

//                         if (err) {
//                             // console.error(err.message); // Log the error message
//                             // Check for specific error codes if needed
//                             if (err.code === 'SQLITE_CONSTRAINT') {
//                                 return res.status(400).send({
//                                     code: "400",
//                                     status: "Unique constraint failed",
//                                     message: "A record with this unique value already exists."
//                                 });
//                             } else {
//                                 return res.status(500).send({
//                                     code: "500",
//                                     status: "Internal Server Error",
//                                     message: err.message,
//                                 });
//                             }
//                         }
//                         if (this.changes === 1) {

//                             let data = { status: 200, message: `data updated with id: ${id} ` }
//                             let content = JSON.stringify(data);
//                             console.log(content);
//                         } else {
//                             let data = { status: 201, message: `no data has been changed` }
//                             let content = JSON.stringify(data);
//                             console.log(content);
//                         }

//                     })

//                 } catch (err) {
//                     console.log(err.message);
//                 }

//             } else {
//                 console.log('No product found with the given URL.');
//                 console.log(" product uploaded");

//                 const productId = await addProductToDatabase(product);
//                 await addProductRelationships(productId, product);
//             }
//         })
//     } catch (error) {
//         console.log("qurey");

//     }

// }


// Function to handle "View More" button clicks

async function updateProduct(product) {
    console.log('from updateProduct');

    const query = `SELECT * FROM PRODUCTS WHERE productUrl = ?`;

    try {
        // Step 1: Select the productId based on the productUrl
        console.log('from updateProduct TRY BLOCK: ' + product.productUrl);

        const row = await new Promise((resolve, reject) => {
            DB.all(query, [product.productUrl], (err, row) => {
                if (err) {
                    console.error(`DB GET Error: ${err}`);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });

        console.log(`Row: ${JSON.stringify(row)}`);

        let productId;

        if (row && row.length > 0) {
            productId = row[0].productId;
            console.log(`Product ID: ${productId}`);

            // Step 2: Update all values where productId matches
            let updateQuery = 'UPDATE PRODUCTS SET ';
            const updates = [];
            const values = [];
            console.log(updateQuery);

            if (typeof product.productPrice !== 'undefined') {
                updates.push(`productPrice = ?`);
                values.push(product.productPrice);
            }
            if (typeof product.productPriceWithoutDiscount !== 'undefined') {
                updates.push(`productPriceWithoutDiscount = ?`);
                values.push(product.productPriceWithoutDiscount);
            }
            if (typeof product.productOriginalPrice !== 'undefined') {
                updates.push(`productOriginalPrice = ?`);
                values.push(product.productOriginalPrice);
            }
            if (typeof product.sizeName !== 'undefined') {
                updates.push(`sizeName = ?`);
                values.push(JSON.stringify(product.sizeName));
            }
            if (typeof product.availability !== 'undefined') {
                updates.push(`availability = ?`);
                values.push(JSON.stringify(product.availability));
            }

            updates.push(`productLastUpdated = ?`);
            values.push(Date.now());

            // Check if there are fields to update
            if (updates.length > 0) {
                const sql = updateQuery + updates.join(', ') + ` WHERE productId = ?`;

                try {
                    const params = [...values, productId];
                    console.log("Executing update query:", sql, params);

                    const changes = await new Promise((resolve, reject) => {
                        const stmt = DB.prepare(sql);
                        stmt.run(...params, function (err) {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(this.changes);
                            }
                        });
                        stmt.finalize();
                    });

                    if (changes === 1) {
                        console.log(JSON.stringify({ status: 200, message: `Data updated with id: ${productId}` }));
                    } else {
                        console.log(JSON.stringify({ status: 201, message: `No data has been changed` }));
                    }
                } catch (err) {
                    if (err.code === 'SQLITE_CONSTRAINT') {
                        console.error({ code: 400, status: "Unique constraint failed", message: "A record with this unique value already exists." });
                    } else {
                        console.error({ code: 500, status: "Internal Server Error", message: err.message });
                    }
                }
            }
        } else {
            console.log('No product found with the given URL.');
            console.log("Product uploaded");

            productId = await addProductToDatabase(product);
            await addProductRelationships(productId, product);
        }

        // ✅ Return the productId in all cases
        return productId;

    } catch (error) {
        console.error("Error in query:", error.message);
        return null; // Return null if there was a failure
    }
}




async function viewMore(page, productCount) {
    const count = Math.ceil(productCount / 12);
    const viewMoreButtonSelector = '#loadmore_btn_category_product';

    await page.waitForSelector(viewMoreButtonSelector, { timeout: 10000 });
    for (let i = 0; i < count; i++) {
        try {
            await page.click(viewMoreButtonSelector);
            console.log(`Button clicked = ${i}`);
            await delay(4000);
        } catch (error) {
            console.error('Error clicking "View More" button:', error + i);
        }
    }
}
async function scrapeImages(page, url) {

    console.log(`Scraping images from: ${url}`);
    const imageSlides = [];

    const query = `SELECT * FROM PRODUCTS WHERE productUrl = ?`;

    try {
        // Step 1: Select the productId based on the productUrl
        console.log('from updateProduct TRY BLOCK: ' + url);

        const row = await new Promise((resolve, reject) => {
            DB.all(query, [url], (err, row) => {
                if (err) {
                    console.error(`DB GET Error: ${err}`);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });

        console.log(`Row: ${JSON.stringify(row)}`);

        if (row && row.length > 0) {
            console.log("product alredy exist");
            return { imageSlides: [], productShortDescription: '' };
        } else {

            try {
                // Navigate to the product detail page
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                const htmlContent = await page.content();

                // Load the HTML into Cheerio
                const $ = cheerio.load(htmlContent);

                // Extract the product description and video url
                const productShortDescription = $('#home p').html();
                const videoURL = $("#myVideo > source").attr('src');

                // Extract image URLs
                $('#slider img').each((index, element) => {
                    const imgSrc = $(element).attr('src');
                    if (imgSrc) {
                        imageSlides.push(imgSrc);
                    }
                });

                console.log('Scraped images:', imageSlides);
                console.log('Scraped description:', productShortDescription);
                console.log('Scraped videoUrl:', videoURL);

                // want to download those images in my project
                // and send that images link in return file
                // if that image from the same url exist then don't download it
                // make folder according to your for the image
                // just send that img link from my project to return file in imageSlides

                return { imageSlides, productShortDescription, videoURL };
            } catch (error) {
                console.error('Error fetching images:', error.message);
                return { imageSlides: [], productShortDescription: '', videoURL: '' };
            }

        }

    } catch (error) {
        console.error("Error in query:", error.message);
    }

}





// Start the scraping process
export {
    fetchDataa, addProductToDatabase,
    updateProduct
}; 