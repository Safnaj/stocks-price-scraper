import puppeteer from "puppeteer";
import admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { google } from "googleapis";
import { readFileSync } from "fs";

admin.initializeApp();

const SERVICE_ACCOUNT = JSON.parse(
  readFileSync("./service-account-key.json", "utf-8"),
);

const SHEET_ID = process.env.SHEET_ID;
const TIMEZONE = "Asia/Colombo";
const CRON_SCHEDULE = "45 14 * * 1-5"; // Weekdays 2:45 PM

const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  credentials: SERVICE_ACCOUNT,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

let browser;

async function fetchSymbols(column) {
  const client = await auth.getClient();
  const res = await sheets.spreadsheets.values.get({
    auth: client,
    spreadsheetId: SHEET_ID,
    range: `Stocks!${column}2:${column}`,
  });
  return res.data.values.flat();
}

async function writeToSheet(column, values) {
  const client = await auth.getClient();
  await sheets.spreadsheets.values.update({
    auth: client,
    spreadsheetId: SHEET_ID,
    range: `Stocks!${column}2:${column}`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

async function fetchPrice(symbol) {
  const page = await browser.newPage();
  try {
    const url = `https://www.tradingview.com/symbols/CSELK-${symbol}/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    const selector = ".lastContainer-zoF9r75I .js-symbol-last > span";
    await page.waitForSelector(selector, { timeout: 10000 });

    const price = await page.$eval(selector, (el) => el.textContent.trim());
    logger.info(`Price for ${symbol}: ${price}`);
    return parseFloat(price);
  } catch (err) {
    logger.error(`Failed to fetch price for ${symbol}: ${err.message}`);
    return null;
  } finally {
    await page.close();
  }
}

async function updateStockPrices() {
  const symbols = await fetchSymbols("B");
  const unique = [...new Set(symbols)];

  const timestamp = new Date().toLocaleString("en-US", { timeZone: TIMEZONE });
  const priceMap = {};

  try {
    logger.info("Launching Puppeteer browser...");
    browser = await puppeteer.launch({ headless: true });

    for (const symbol of unique) {
      priceMap[symbol] = await fetchPrice(symbol);
    }

    const prices = symbols.map((s) => [priceMap[s]]);
    const timestamps = symbols.map((s) => [
      priceMap[s] === null ? "Error" : timestamp,
    ]);

    await writeToSheet("H", prices);
    await writeToSheet("L", timestamps);

    logger.info("Stock prices updated successfully !!");
  } catch (err) {
    logger.error(`Browser error: ${err.message}`);
    const errorValues = symbols.map(() => [null]);
    const errorTimestamps = symbols.map(() => ["Browser Error"]);
    await writeToSheet("H", errorValues);
    await writeToSheet("L", errorTimestamps);
  } finally {
    logger.info("Closing browser...");
    if (browser) await browser.close();
    browser = null;
  }
}

// Cloud Function onRequest
export const updateStockPricesOnRequest = onRequest(
  { memory: "1GiB" },
  async (req, res) => {
    await updateStockPrices();
    res.send("Stock prices updated successfully");
  },
);

// Cloud Function onSchedule
export const updateStockPricesDaily = onSchedule(
  {
    schedule: CRON_SCHEDULE,
    timeZone: TIMEZONE,
    memory: "1GiB",
  },
  updateStockPrices,
);
