import puppeteer from "puppeteer";
import admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { google } from "googleapis";
import { readFileSync } from "fs";

admin.initializeApp();

const SERVICE_ACCOUNT = JSON.parse(
  readFileSync("./service-account-key.json", "utf-8")
);

const SHEET_ID = process.env.SHEET_ID;
const CRON_SCHEDULE = "45 14 * * 1-5"; // Every weekday at 2:45 PM

const TIMEZONE = "Asia/Colombo";
const TIMESTAMP = new Date().toLocaleString("en-US", {
  timeZone: TIMEZONE,
});

const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  credentials: SERVICE_ACCOUNT,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Fetch Stock Price
async function fetchStockPrice(symbol) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const url = `https://www.tradingview.com/symbols/CSELK-${symbol}/`;
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    const priceSelector = ".lastContainer-JWoJqCpY .js-symbol-last > span";
    await page.waitForSelector(priceSelector);

    const price = await page.$eval(priceSelector, (el) =>
      el.textContent.trim()
    );

    logger.info(`Price for ${symbol}: ${price}`);
    return parseFloat(price);
  } catch (error) {
    logger.error(`Error fetching price for ${symbol}: ${error.message}`);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Update Stock Prices
async function updateStockPrices() {
  try {
    logger.info("Fetching stock symbols...");
    const authClient = await auth.getClient();
    const response = await sheets.spreadsheets.values.get({
      auth: authClient,
      spreadsheetId: SHEET_ID,
      range: "Sheet1!B2:B",
    });

    const symbols = response.data.values?.flat() || [];
    if (symbols.length === 0) {
      logger.warn("No stock symbols found.");
      return;
    }

    // Fetch all stock prices in parallel
    const prices = await Promise.all(symbols.map(fetchStockPrice));
    const updates = prices.map((price) => [price ?? "Error fetching price"]);
    const timestamps = symbols.map(() => [TIMESTAMP]);

    // Update Stock Prices
    await sheets.spreadsheets.values.update({
      auth: authClient,
      spreadsheetId: SHEET_ID,
      range: "Sheet1!H2:H",
      valueInputOption: "RAW",
      requestBody: { values: updates },
    });

    // Update Timestamps
    await sheets.spreadsheets.values.update({
      auth: authClient,
      spreadsheetId: SHEET_ID,
      range: "Sheet1!L2:L",
      valueInputOption: "RAW",
      requestBody: { values: timestamps },
    });

    logger.info("Stock prices updated successfully.");
  } catch (error) {
    logger.error("Error updating stock prices:", error.message);
  }
}

// Cloud Function: HTTP Trigger
export const updateStockPricesOnRequest = onRequest(
  { memory: "1GiB" },
  async (req, res) => {
    try {
      logger.info("Received request to update stock prices.");
      await updateStockPrices();
      res.status(200).send("Stock prices updated successfully!");
    } catch (error) {
      logger.error("Error triggered stock price update:", error.message);
      res.status(500).send("Failed to update stock prices.");
    }
  }
);

// Cloud Function: Scheduled Trigger
export const updateStockPricesDaily = onSchedule(
  {
    schedule: CRON_SCHEDULE,
    timeZone: TIMEZONE,
    memory: "1GiB",
  },
  async () => {
    try {
      logger.info("Triggered scheduled stock price update.");
      await updateStockPrices();
    } catch (error) {
      logger.error("Error in scheduled stock price update:", error.message);
    }
  }
);
