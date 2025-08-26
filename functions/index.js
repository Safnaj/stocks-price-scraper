import fetch from "node-fetch";
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
  try {
    const res = await fetch("https://www.cse.lk/api/tradeSummary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    const stock = data.reqTradeSummery.find((s) => s.symbol === symbol);

    if (stock) {
      logger.info(`Price for ${symbol}: ${stock.closingPrice}`);
      return stock.closingPrice;
    } else {
      logger.warn(`Symbol ${symbol} not found in API`);
      return null;
    }
  } catch (err) {
    logger.error(`Failed to fetch price for ${symbol}: ${err.message}`);
    return null;
  }
}

async function updateStockPrices() {
  const symbols = await fetchSymbols("B");
  const unique = [...new Set(symbols)];

  const timestamp = new Date().toLocaleString("en-US", { timeZone: TIMEZONE });
  const priceMap = {};

  try {
    logger.info("Making API requests to fetch stock prices...");
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
    logger.error(`API error: ${err.message}`);
    const errorValues = symbols.map(() => [null]);
    const errorTimestamps = symbols.map(() => ["API Error"]);
    await writeToSheet("H", errorValues);
    await writeToSheet("L", errorTimestamps);
  }
}

// Cloud Function onRequest
export const updateStockPricesOnRequest = onRequest(
  { memory: "1GiB" },
  async (req, res) => {
    logger.info("HTTP request to update stock prices received");
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
  async () => {
    logger.info("Scheduled stock price update triggered");
    await updateStockPrices();
  },
);
