require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const https = require('https');
const { utimes } = require('utimes');

const MINUTE = 60000;
const HOUR = MINUTE * 60;
const NUMBER_OF_DAYS_TO_SCRAPE = process.env.NUMBER_OF_DAYS_TO_SCRAPE || 90;
const BATCH_SIZE = 50; // Number of days to process in each batch
const NUMBER_OF_CONCURRENT_PROCESSES = Number(process.env.NUMBER_OF_CONCURRENT_PROCESSES) || 5;

/* -------------------- Utility Functions -------------------- */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
    // console.log('Saving image from ' + event.event_date);
    await fs.promises.mkdir(folder, { recursive: true });
    const imageBuffer = await response.buffer();
    await fs.promises.writeFile(filePath, imageBuffer);
  } else {
    // console.log('Image already found: ' + event.event_date);
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

/* -------------------- Main Scrape Function with Concurrency Limit -------------------- */
async function scrape() {
  console.log(`Starting to scrape the past ${NUMBER_OF_DAYS_TO_SCRAPE} days concurrently. Current time is ${new Date().toISOString()}`);

  const browser = await puppeteer.launch({ headless: true });
  
  // Use a temporary page to login and retrieve cookies.
  const tempPage = await browser.newPage();
  if (!(await login(tempPage))) {
    console.log('Login failed');
    await browser.close();
    return;
  }
  const cookies = await tempPage.cookies();
  await tempPage.close();

  const totalDays = Number(NUMBER_OF_DAYS_TO_SCRAPE);
  const numBatches = Math.ceil(totalDays / BATCH_SIZE);
  const now = new Date();

  // Start timing the batch processing
  const startTime = Date.now();

  // Create an array of batch tasks.
  const batchTasks = [];
  for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
    const currentBatchSize = Math.min(BATCH_SIZE, totalDays - batchIndex * BATCH_SIZE);
    
    const batchEnd = new Date(now);
    batchEnd.setDate(batchEnd.getDate() - batchIndex * BATCH_SIZE);
    
    const batchStart = new Date(batchEnd);
    batchStart.setDate(batchStart.getDate() - currentBatchSize);
    
    // Create a task that opens a new page, sets the cookies, processes the batch, and then closes the page.
    const task = (async (index, start, end) => {
      const page = await browser.newPage();
      await page.setCookie(...cookies);
      await processBatch(page, start, end);
      await page.close();
      console.log(`Completed batch ${index + 1} of ${numBatches}`);
    })(batchIndex, batchStart, batchEnd);
    
    batchTasks.push(task);
  }

  // Process tasks in chunks to limit concurrency.
  for (let i = 0; i < batchTasks.length; i += NUMBER_OF_CONCURRENT_PROCESSES) {
    const tasksChunk = batchTasks.slice(i, i + NUMBER_OF_CONCURRENT_PROCESSES);
    await Promise.all(tasksChunk);
  }
  
  // Calculate elapsed time
  const elapsedTime = (Date.now() - startTime) / 1000;
  console.log(`All batches completed concurrently in ${elapsedTime} seconds!`);

  await browser.close();
}


/* -------------------- Main Entry Point -------------------- */
(async () => {
  await scrape();
})();