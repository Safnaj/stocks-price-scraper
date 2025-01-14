# Stock Price Scraper with Firebase Functions

This project fetches stock prices from the Colombo Stock Exchange and updates them in a Google Sheet daily.

## Features

- Fetches live stock prices using Puppeteer.
- Updates Google Sheets with current stock prices daily.
- Scheduled to run every weekday at 2:45 PM.
- Uses Firebase Functions with a memory limit of 1 GB, which still falls under the free tier.

## Prerequisites

1. **Node.js**: Ensure you have Node.js installed on your machine.
2. **Firebase CLI**: Install the Firebase CLI globally using `npm install -g firebase-tools`.
3. **Google Cloud Service Account Key**:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/).
   - Create a new service account or use an existing one.
   - Assign the **Editor** role to the service account.
   - Generate a **JSON key** for the service account and download it.
   - Place the JSON file in the root of your project directory and name it `service-account-key.json`.
4. **Enable Google Sheets API**:
   - Navigate to the [Google Cloud API Library](https://console.cloud.google.com/apis/library).
   - Search for **Google Sheets API** and enable it for your project.

## Firebase Setup

1. Install the Firebase CLI:
   ```bash
   npm install -g firebase-tools
2. Initialize Firebase in your project directory:
   ```bash
   firebase init functions
3. Deploy the functions to Firebase Hosting after implementation.
   ```bash
   firebase deploy --only functions


## Setting Up Google Sheets

1. Create a Google Sheet with the following structure:
   - **Column A**: Stock Symbols (e.g., CARG, LOLC).
   - **Column H**: Updated stock prices will appear here.
   - **Column L**: Timestamps for when the prices were last updated.
2. Share the Google Sheet with the service account email from your `service-account-key.json`.
   

## Firebase Free Tier

- Firebase provides **400,000 GB-seconds** of free compute time per month.
- A 1 GB function running for 60 seconds consumes **60 GB-seconds** per invocation.
- Scheduled to run 5 times per week (Monday to Friday).
- A month typically has 4 weeks, so the function runs about 20 times per month.
- Monthly consumption:  
  `60 GB-seconds × 20 invocations = ~600 GB-seconds`.  
  This is well within the 400,000 GB-seconds free tier.


## How to Run Locally

1. Clone the repository to your local machine.
2. Install dependencies using `npm install`.
3. Test the Firebase Function locally using `firebase emulators:start --only functions`.
4. Deploy the function to Firebase using `firebase deploy --only functions`.


## Notes

- The Puppeteer browser requires sufficient memory; this project uses 1 GB memory allocation to avoid performance issues.
- Ensure the `CRON_SCHEDULE` and `TIMEZONE` variables in the code are set correctly for your region.
