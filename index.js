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
            await page.goto('https://www.tadpoles.com/parents');
            const links = await page.$$eval('a.fancybox', e=>e.map(a=>{return {id:a.id, href:a.href}}));
            console.log(`Got ${links.length} images. Downloading now`);
            for(var i = 0;i < links.length; i++) {
            if (fs.existsSync(`./images/${links[i].id}.png`)) {
                console.log(`Image ${i} already exists. Skipping.`);
            } else {
                console.log('Downloading image: ' + i);
                const pageNew = await browser.newPage()
                const response = await pageNew.goto(links[i].href, {timeout: 0, waitUntil: 'networkidle0'})
                const imageBuffer = await response.buffer()
                await fs.promises.writeFile(`./images/${links[i].id}.png`, imageBuffer)
                pageNew.close();
            }
            }
            console.log('All done!');     
            await browser.close();
        } else {
            console.log('Login failed');
        }

    }

    setInterval(await scrapeBabies, MINUTE*5);
    await scrapeBabies();
})();