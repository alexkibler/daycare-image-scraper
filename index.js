const puppeteer = require('puppeteer');
const fs = require('fs');
const https = require('https');
const {utimes} = require('utimes');
const MINUTE = 60000;
const HOUR = MINUTE * 60;
const NUMBER_OF_DAYS_TO_SCRAPE = 1000;

(async () => {

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

    async function scrapeBabies() {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        if (await login(page)) {
            let startDate = new Date();
            startDate.setDate(startDate.getDate() - NUMBER_OF_DAYS_TO_SCRAPE);
            startDate = Math.floor(startDate.getTime() / 1000)
            await page.goto(`https://www.tadpoles.com/remote/v1/events?direction=range&earliest_event_time=${startDate}&latest_event_time=${Math.ceil(Date.now() / 1000)}&num_events=300&client=dashboard&type=Activity`);
            var apiResponse = await page.content();

            const innerText = await page.evaluate(() =>  {
                return JSON.parse(document.querySelector("body").innerText); 
            }); 
            for (var i = 0; i < innerText.events.length; i++) {
                const obj = innerText.events[i].key;
                const key = innerText.events[i].attachments[0];
                var url = `https://www.tadpoles.com/remote/v1/obj_attachment?obj=${obj}&key=${key};`
                try
                {
                    const response = await page.goto(url, {timeout: 0, waitUntil: 'networkidle0'});
                    if (innerText.events[i].new_attachments[0]?.mime_type == 'video/mp4'){

                        // TODO: figure out why videos don't work

                    } else {
                        const path = `./images/${innerText.events[i].event_date.substr(0,7)}/${innerText.events[i].event_time}.png`
                        if (!fs.existsSync(path)) {
                            console.log('Saving image from ' + innerText.events[i].event_date);
                            await fs.mkdirSync(`./images/${innerText.events[i].event_date}`, { recursive: true});
                            const imageBuffer = await response.buffer()
                            await fs.promises.writeFile(path, imageBuffer)
                            await utimes(path, +(innerText.events[i].event_time.toString()+'000'))
                        } else {
                            console.log('Image already exists: ' + innerText.events[i].event_date);
                        }
                    }

                }
                catch (error)
                {
                    console.error(error);
                }
            }
            console.log('All done!');     
        } else {
            console.log('Login failed');
        }
        await browser.close();

    }

    setInterval(await scrapeBabies, HOUR);
    await scrapeBabies();
})();