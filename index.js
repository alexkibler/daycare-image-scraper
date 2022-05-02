const puppeteer = require('puppeteer');
const fs = require('fs');
const https = require('https');
const MINUTE = 60000;
const HOUR = MINUTE * 60;


(async () => {

    async function scrapeBabies() {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        const cookiesFilePath = 'cookies.json';
        const previousSession = fs.existsSync(cookiesFilePath)
        if (previousSession) {
          // If file exist load the cookies
          const cookiesString = fs.readFileSync(cookiesFilePath);
          const parsedCookies = JSON.parse(cookiesString);
          if (parsedCookies.length !== 0) {
            for (let cookie of parsedCookies) {
              await page.setCookie(cookie)
            }
            console.log('Session has been loaded in the browser')
          }
        }
      
        await page.goto('https://www.tadpoles.com/parents');
        const links = await page.$$eval('a.fancybox', e=>e.map(a=>{return {id:a.id, href:a.href}}));
        console.log(`Got ${links.length} images. Downloading now`);
        //const html = await imageDivsHandle.evaluate((imageDivs) => imageDivs.innerHTML, imageDivsHandle)
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
       
      //   for(var i = 0; i < links.length; i++) {
      //       await page.goto(links[i].href);
      //       await page.screenshot({path: './images/'+links[i].id+'.png'});
      //   }
      
        await browser.close();
    }

    setInterval(await scrapeBabies, HOUR);
})();