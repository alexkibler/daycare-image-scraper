require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const https = require('https');
const { utimes } = require('utimes');

const MINUTE = 60000;
const HOUR = MINUTE * 60;
const NUMBER_OF_DAYS_TO_SCRAPE = process.env.NUMBER_OF_DAYS_TO_SCRAPE || 90;
const BATCH_SIZE = 60;

/* -------------------- Utility Functions -------------------- */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* Async file existence check */
async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/* -------------------- Authentication -------------------- */
async function login(page) {
  const cookiesFilePath = 'cookies.json';
  try {
    const cookiesString = await fs.promises.readFile(cookiesFilePath, 'utf-8');
    const parsedCookies = JSON.parse(cookiesString);
    if (parsedCookies && parsedCookies.length > 0) {
      await page.setCookie(...parsedCookies);
      console.log('Session has been loaded in the browser');
      return true;
    }
  } catch (error) {
    console.error('Error loading cookies:', error);
  }
  return false;
}

/* -------------------- File Handling -------------------- */
async function downloadImage(event, response) {
  const folder = `${process.env.DOWNLOAD_PATH}/${event.event_date.substr(0, 7)}`;
  const filePath = `${folder}/${event.event_time}.png`;

  if (!(await fileExists(filePath))) {
    console.log('Saving image from ' + event.event_date);
    await fs.promises.mkdir(folder, { recursive: true });
    const imageBuffer = await response.buffer();
    await fs.promises.writeFile(filePath, imageBuffer);
  } else {
    console.log('Image already found: ' + event.event_date);
  }
  // Adjust the file timestamp using utimes
  await utimes(filePath, +(event.event_time.toString() + '000'));
}

/* -------------------- Processing Functions -------------------- */
async function processRecords(apiData, page) {
  for (let event of apiData.events) {
    const { key: obj, attachments, new_attachments } = event;
    const key = attachments[0];
    const url = `${process.env.API_BASE_URL}/obj_attachment?obj=${obj}&key=${key}`;

    try {
      const response = await page.goto(url, { timeout: 0, waitUntil: 'networkidle0' });
      if (new_attachments[0]?.mime_type === 'video/mp4') {
        // TODO: figure out why videos don't work
      } else {
        await downloadImage(event, response);
      }
    } catch (error) {
      console.error('Error processing event:', error);
    }
    await delay(100);
  }
}

async function processBatch(page, startDate, endDate) {
  console.log(`Processing batch from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  const url = `${process.env.API_BASE_URL}/events?direction=range` +
              `&earliest_event_time=${Math.floor(startDate.getTime() / 1000)}` +
              `&latest_event_time=${Math.floor(endDate.getTime() / 1000)}` +
              `&num_events=300&client=dashboard&type=Activity`;

  await page.goto(url, { timeout: 0, waitUntil: 'networkidle0' });
  const apiResponseJson = await page.evaluate(() => {
    return JSON.parse(document.querySelector("body").innerText);
  });
  await processRecords(apiResponseJson, page);
}

/* -------------------- Main Scrape Function -------------------- */
async function scrape() {
  console.log(`Starting to scrape the past ${NUMBER_OF_DAYS_TO_SCRAPE} days. Current time is ${new Date().toISOString()}`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  if (await login(page)) {
    let remainingDays = NUMBER_OF_DAYS_TO_SCRAPE;
    let batchCount = 0;

    while (remainingDays > 0) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - ((batchCount + 1) * BATCH_SIZE));

      const endDate = new Date();
      endDate.setDate(endDate.getDate() - (batchCount * BATCH_SIZE) + 1);

      await processBatch(page, startDate, endDate);

      remainingDays -= BATCH_SIZE;
      batchCount++;
      console.log(`Completed batch ${batchCount}. ${remainingDays} days remaining to scrape.`);
      await delay(1000); // Pause briefly between batches
    }
    console.log('All done!');
  } else {
    console.log('Login failed');
  }

  await browser.close();
}

/* -------------------- Scheduling -------------------- */
async function scheduleScrape() {
  await scrape();
  // Schedule the next scrape run after HOUR milliseconds
  setTimeout(scheduleScrape, HOUR);
}

/* -------------------- Main Entry Point -------------------- */
(async () => {
  scheduleScrape();
})();