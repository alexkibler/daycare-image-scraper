# Baby frog daycare software image scraper

My son attends a daycare that uses an app (whose name I'm not mentioning because I'm almost definitely breaking their TOS) where they can upload photos of him, daily reports, etc.

Rather than having to remember to manually save all of those images, I wanted to see if I could write something to do it automatically.

Setup:
1. Login to tadpoles.
2. Use the [Export cookie JSON file for Puppeteer](https://chrome.google.com/webstore/detail/%E3%82%AF%E3%83%83%E3%82%AD%E3%83%BCjson%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB%E5%87%BA%E5%8A%9B-for-puppet/nmckokihipjgplolmcmjakknndddifde) chrome extension to dump your login cookie to `cookies.json` in the root of the project.
3. Create a .env file with the correct values from .env.example
4. `yarn start`
5. As it runs, it will create an images directory with a subdirectory for every day, download each image for that day, and set the created date to the correct date (so that when you upload to google photos, they'll show up in the correct place)