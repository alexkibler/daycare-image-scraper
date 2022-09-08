require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const https = require('https');
const {utimes} = require('utimes');
const MINUTE = 60000;
const HOUR = MINUTE * 60;
const NUMBER_OF_DAYS_TO_SCRAPE = 90;

(async () => {


    async function scrape() {
        console.log(`Starting to scrape.  Current time is ${new Date().toISOString()}`)
        const browser = await puppeteer.launch({headless: false});
        const page = await browser.newPage();
        if (await login(page)) {
            let startDate = getStartDate();
            await page.goto(`${process.env.API_BASE_URL}/events?direction=range&earliest_event_time=${startDate}&latest_event_time=${Math.ceil(Date.now() / 1000)}&num_events=300&client=dashboard&type=Activity`);
            var apiResponse = await page.content();

            const apiResponseJson = await page.evaluate(() =>  {
                return JSON.parse(document.querySelector("body").innerText); 
            }); 
            await processRecords(apiResponseJson, page);
            console.log('All done!');     
        } else {
            console.log('Login failed');
        }
        await browser.close();

    }

    setInterval(await scrape, HOUR);
    await scrape();

    function getStartDate() {
        let startDate = new Date();
        startDate.setDate(startDate.getDate() - NUMBER_OF_DAYS_TO_SCRAPE);
        startDate = Math.floor(startDate.getTime() / 1000);
        return startDate;
    }

    async function processRecords(innerText, page) {
        
        const delay = (delayInms) => {
            return new Promise(resolve => setTimeout(resolve, delayInms));
        }
        for (var i = 0; i < innerText.events.length; i++) {
            const obj = innerText.events[i].key;
            const key = innerText.events[i].attachments[0];
            var url = `${process.env.API_BASE_URL}/obj_attachment?obj=${obj}&key=${key}`;
            try {
                const response = await page.goto(url, { timeout: 0, waitUntil: 'networkidle0' });
                if (innerText.events[i].new_attachments[0]?.mime_type == 'video/mp4') {
                    // TODO: figure out why videos don't work
                } else {
                    await downloadImage(innerText, i, response);
                }

            }
            catch (error) {
                console.error(error);
            }
            await delay(100);
        }
    }

    async function login(page) {
        const cookiesFilePath = 'cookies.json';
        const previousSession = fs.existsSync(cookiesFilePath)
        if (previousSession) {
          const cookiesString = fs.readFileSync(cookiesFilePath);
          const parsedCookies = JSON.parse(cookiesString);
          if (parsedCookies.length !== 0) {
            for (let cookie of parsedCookies) {
              await page.setCookie(cookie)
            }
            console.log('Session has been loaded in the browser')
            return true
          }
          return false;
        } 
        return false;
    }

    async function downloadImage(innerText, i, response) {
        const path = `${process.env.DOWNLOAD_PATH}/${innerText.events[i].event_date.substr(0, 7)}/${innerText.events[i].event_time}.png`;
        if (!fs.existsSync(path)) {
            console.log('Saving image from ' + innerText.events[i].event_date);
            await fs.mkdirSync(`${process.env.DOWNLOAD_PATH}/${innerText.events[i].event_date.substr(0, 7)}`, { recursive: true });
            const imageBuffer = await response.buffer();
            await fs.promises.writeFile(path, imageBuffer);
        }
        await utimes(path, +(innerText.events[i].event_time.toString() + '000'));
    }

})();