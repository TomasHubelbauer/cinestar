const puppeteer = require('puppeteer');
const fs = require('fs-extra');
let email;
try {
  email = require('../self-email');
}
catch (error) {
  // Ignore missing email dependency on systems which don't have it
}

module.exports = async function () {
  const browser = await puppeteer.launch();
  const [page] = await browser.pages();
  await page.goto('https://www.cinestar.cz/cz/praha9/program');

  /** @typedef {{ name: string; posterUrl: string; date: Date; }} Title */

  /** @type {Title[]} */
  const titles = [];
  try {
    titles.push(...await fs.readJson('titles.json'));
    for (const title of titles) {
      // Parse string dates from storage to runtime `Date` object instance representation
      title.date = new Date(title.date);
    }
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
          titles.push({ name, posterUrl, date });
          if (email) {
            false && await email(`
From: CineStar Digest <bot@hubelbauer.net>
To: tomas@hubelbauer.net
Subject: CineStar premiere: "${name}"
Content-Type: text/html

<p>
CineStar premieres "${name}" at ${date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}!
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

  if (email) {
    // Check out what movies screen tonight and notify about those
    const today = new Date();
    /** @type {Title[]} */
    const tonight = [];
    for (const title of titles) {
      if (title.date.getFullYear() === today.getFullYear() && title.date.getMonth() === today.getMonth() && title.date.getDate() === today.getDate()) {
        tonight.push(title);
      }
    }

    await email(`
From: CineStar Screenings Tonight <bot@hubelbauer.net>
To: Tomas Hubelbauer <tomas@hubelbauer.net>
Subject: ${tonight.map(t => t.name).join(', ')}
Content-Type: text/html

<p>CineStar screens ${tonight.length} titles tonight!</p>
${tonight.map(t => `<p>${t.name}</p>\n<img src="${t.posterUrl}" />\n`).join('')}

<p>Thanks!</p>
`);
  }
};

module.exports();
