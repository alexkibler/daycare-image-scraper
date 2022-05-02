const puppeteer = require('puppeteer');
const fs = require('fs');
const https = require('https');
const MINUTE = 60000;
const HOUR = MINUTE * 60;


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
            await page.goto('https://www.tadpoles.com/remote/v1/events?direction=range&earliest_event_time=1&latest_event_time=164369160000&num_events=300&client=dashboard&type=Activity');
            var apiResponse = await page.content();

            const innerText = await page.evaluate(() =>  {
                return JSON.parse(document.querySelector("body").innerText); 
            }); 
            for (var i = 0; i < innerText.events.length; i++) {
                const obj = innerText.events[i].key;
                const key = innerText.events[i].attachments[0];
                var url = `https://www.tadpoles.com/remote/v1/obj_attachment?obj=${obj}&key=${key};`
                const response = await page.goto(url, {timeout: 0, waitUntil: 'networkidle0'});
                if (!fs.existsSync(`./images/${innerText.events[i].event_date}/${innerText.events[i].attachments[0]}.png`)) {
                    console.log('Saving image from ' + innerText.events[i].event_date);
                    await fs.mkdirSync(`./images/${innerText.events[i].event_date}`, { recursive: true});
                    const imageBuffer = await response.buffer()
                    await fs.promises.writeFile(`./images/${innerText.events[i].event_date}/${innerText.events[i].attachments[0]}.png`, imageBuffer)
                } else {
                    console.log('Image already exists: ' + innerText.events[i].event_date);
                }
                await new Promise(r => setTimeout(r, 100));
            }
            // const links = await page.$$eval('a.fancybox', e=>e.map(a=>{return {id:a.id, href:a.href}}));
            // console.log(`Got ${links.length} images. Downloading now`);
            // for(var i = 0;i < links.length; i++) {
            // if (fs.existsSync(`./images/${links[i].id}.png`)) {
            //     console.log(`Image ${i} already exists. Skipping.`);
            // } else {
            //     console.log('Downloading image: ' + i);
            //     const pageNew = await browser.newPage()
            //     const response = await pageNew.goto(links[i].href, {timeout: 0, waitUntil: 'networkidle0'})
            //     const imageBuffer = await response.buffer()
            //     await fs.promises.writeFile(`./images/${links[i].id}.png`, imageBuffer)
            //     pageNew.close();
            // }
            // }
            // console.log('All done!');     
            // await browser.close();
        } else {
            console.log('Login failed');
        }

    }

    setInterval(await scrapeBabies, HOUR);
    await scrapeBabies();
})();