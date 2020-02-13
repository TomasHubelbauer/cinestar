const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const email = require('../self-email');
const headers = require('../self-email/headers');

module.exports = async function () {
  const browser = await puppeteer.launch({ headless: false });
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
          await email(
            headers('CineStar', name),
            `<p>${name} premieres at ${date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}!</p>`,
            'Thank you'
          );
        }
        else {
          console.log('\t\t', name);
        }
      }
    }
  }

  await fs.writeJson('titles.json', titles, { spaces: 2 });
  await browser.close();

  // Check out what movies screen tonight and notify about those
  const today = new Date();
  /** @type {Title[]} */
  const tonight = [];
  for (const title of titles) {
    if (title.date.getFullYear() === today.getFullYear() && title.date.getMonth() === today.getMonth() && title.date.getDate() === today.getDate()) {
      tonight.push(title);
    }
  }

  await email(
    headers('CineStar Tonight', tonight.map(t => t.name).join(', ')),
    `<p>CineStar screens ${tonight.length} titles tonight!</p>`,
    ...tonight.map(t => `<p>${t.name}</p>\n<img src="${t.posterUrl}" />`),
    'Thank you'
  );
};

module.exports();
