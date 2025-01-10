const functions = require("firebase-functions/v1");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const puppeteer = require("puppeteer");
const { google } = require("googleapis");
const SERVICE_ACCOUNT = require("./service-account-key.json");

const WEEKDAY_CRON = "45 14 * * 1-5"; // Weekdays at 2:45 PM
const TIMEZONE = "Asia/Colombo";
const SHEET_ID = "1D8F0FZkYYnaL42hzO1DISiSI_EXD4tI0-dKl3omkgjw";
const TIMESTAMP = new Date().toLocaleString("en-US", {
  timeZone: TIMEZONE,
});

admin.initializeApp();

const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  credentials: SERVICE_ACCOUNT,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function fetchStockPrice(symbol) {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const url = `https://www.tradingview.com/symbols/CSELK-${symbol}/`;
    await page.goto(url, { waitUntil: "networkidle2" });

    const priceSelector = ".lastContainer-JWoJqCpY .js-symbol-last > span";
    await page.waitForSelector(priceSelector);

    const price = await page.$eval(priceSelector, (el) =>
      el.textContent.trim(),
    );
    logger.log(`Price for ${symbol}: ${price}`);
    await browser.close();
    return parseFloat(price);
  } catch (error) {
    logger.error(`Error fetching price for ${symbol}:`, error.message);
    return null;
  }
}

async function updateStockPrices() {
  try {
    logger.log("Fetching stock symbols...");
    const authClient = await auth.getClient();
    const response = await sheets.spreadsheets.values.get({
      auth: authClient,
      spreadsheetId: SHEET_ID,
      range: "Sheet1!B2:B",
    });

    const symbols = response.data.values.flat();
    const updates = [];
    const timestamps = [];

    for (const symbol of symbols) {
      try {
        const price = await fetchStockPrice(symbol);
        updates.push([price]);
      } catch (error) {
        updates.push([symbol, "Error fetching price"]);
      }
      timestamps.push([TIMESTAMP]);
    }

    // Update Stock Prices
    await sheets.spreadsheets.values.update({
      auth: authClient,
      spreadsheetId: SHEET_ID,
      range: "Sheet1!H2:H",
      valueInputOption: "RAW",
      requestBody: {
        values: updates,
      },
    });

    // Update Timestamps
    await sheets.spreadsheets.values.update({
      auth: authClient,
      spreadsheetId: SHEET_ID,
      range: "Sheet1!L2:L",
      valueInputOption: "RAW",
      requestBody: {
        values: timestamps,
      },
    });

    logger.log("Stock prices updated successfully.");
  } catch (error) {
    logger.error("Error updating stock prices:", error.message);
  }
}

// Cloud Function: HTTP trigger
exports.updateStockPricesOnRequest = functions.https.onRequest(
  async (req, res) => {
    try {
      logger.log("Received request to update stock prices.");
      await updateStockPrices();
      res.status(200).send("Stock prices updated successfully!");
    } catch (error) {
      logger.error(
        "Error in HTTP-triggered stock price update:",
        error.message,
      );
      res.status(500).send("Failed to update stock prices.");
    }
  },
);

// Cloud Function: Scheduled trigger
exports.updateStockPricesDaily = functions.pubsub
  .schedule(WEEKDAY_CRON)
  .timeZone(TIMEZONE)
  .onRun(async () => {
    try {
      logger.log("Triggered scheduled stock price update.");
      await updateStockPrices();
    } catch (error) {
      logger.error("Error in scheduled stock price update:", error.message);
    }
  });
