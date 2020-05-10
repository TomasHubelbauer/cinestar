const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

/** @typedef {{ name: string; posterUrl: string; date: Date; }} Title */

module.exports = async function () {
  const browser = await puppeteer.launch();
  const [page] = await browser.pages();
  await page.goto('https://www.cinestar.cz/cz/praha9/program');

  const titlesJsonFilePath = path.join(__dirname, 'titles.json');

  /** @type {Title[]} */
  const titles = [];
  try {
    titles.push(...await fs.readJson(titlesJsonFilePath));
    for (const title of titles) {
      // Parse string dates from storage to runtime `Date` object instance representation
      title.date = new Date(title.date);
    }
  }
  catch (error) {
    // Ignore missing or broken `titles.json`
  }

  const messages = [];

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
      console.log(day, typeName);

      for (const titleTd of await roomTable.$$('.tdTitle')) {
        const name = await titleTd.$eval('.title a', a => a.textContent);
        const posterUrl = await titleTd.$eval('img', img => img.src);

        const exists = !!titles.find(title => title.name === name);
        if (!exists) {
          console.log(day, typeName, name, '[NEW]');
          titles.push({ name, posterUrl, date });
          messages.push(`${name} premieres at ${date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}!`);
        }
        else {
          console.log(day, typeName, name, '[KNOWN]');
        }
      }
    }
  }

  await fs.writeJson(titlesJsonFilePath, titles, { spaces: 2 });
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

  if (tonight.length === 0) {
    messages.push(`CineStar doesn't screen any titles tonight.`);
  }
  else {
    messages.push(`CineStar screens ${tonight.length} titles tonight!`);
    for (const title of tonight) {
      messages.push(`${t.name} <img src="${t.posterUrl}" />`);
    }
  }

  return messages;
};

if (process.cwd() === __dirname) {
  module.exports().then(console.log);
}
