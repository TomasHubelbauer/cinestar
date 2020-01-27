const puppeteer = require('puppeteer');
const fs = require('fs-extra');
let email;
try {
  email = require('../self-email');
}
catch (error) {
  // Ignore missing email dependency on systems which don't have it
}

void async function () {
  const browser = await puppeteer.launch({ headless: false });
  const [page] = await browser.pages();
  await page.goto('https://www.cinestar.cz/cz/praha9/program');

  const titles = [];
  try {
    titles.push(...await fs.readJson('titles.json'));
  }
  catch (error) {
    // Ignore missing or broken `titles.json`
  }

  const typeCodes = ['atmos', 'tag-2d', 'tag-3d'];
  const typeNames = ['Unknown', 'Atmos', '2D', '3D'];
  for (let offset = 0; offset < 5; offset++) {
    let date = new Date();
    date.setDate(date.getDate() + offset);

    /** @type {'Today' | 'Tomorrow' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'} */
    let day;
    if (offset === 0) {
      day = 'Today';
    }
    else if (offset === 1) {
      day = 'Tomorrow';
    }
    else {
      day = date.toLocaleDateString('en-US', { weekday: 'long' });
    }

    console.log(day);
    for (const roomTable of await page.$$(`#ctab${offset} #tableProgram`)) {
      const typeCode = await roomTable.evaluate(roomTable => roomTable.className);
      const typeName = typeNames[typeCodes.indexOf(typeCode) + 1 /* Shift to make `-1` into `0` for catch-all */];
      console.log('\t', typeName);

      for (const titleTd of await roomTable.$$('.tdTitle')) {
        const name = await titleTd.$eval('.title a', a => a.textContent);
        const posterUrl = await titleTd.$eval('img', img => img.src);

        const exists = !!titles.find(title => title.name === name);
        if (!exists) {
          console.log('\t\t', name, '[NEW]');
          titles.push({ name, posterUrl });
          if (email) {
            await email(`
From: CineStar Digest <bot@hubelbauer.net>
To: tomas@hubelbauer.net
Subject: CineStar premiere: "${name}"
Content-Type: text/html

<p>
CineStar premieres "${name}" at ${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}!
</p>
<img src="${posterUrl}" />
<br />
Thanks!
`);
          }
        }
        else {
          console.log('\t\t', name);
        }
      }
    }
  }

  await fs.writeJson('titles.json', titles, { spaces: 2 });
  await browser.close();
}()
