const fs = require('fs');
const path = require('path');
const {
  exchangeNpssoForCode,
  exchangeCodeForAccessToken,
  getTitleTrophyGroups,
  getTitleTrophies
} = require('psn-api');

const NPSSO = 'token'; // https://ca.account.sony.com/api/v1/ssocookie
const OUTPUT_DIR = path.join(__dirname, 'json');
const VALID_LOG = path.join(__dirname, 'valid.txt');

const END_INDEX = 99999;
const CONCURRENT_LIMIT = 1000;
const BATCH_DELAY_MS = 1000;

const startArg = process.argv.find(arg => arg.startsWith('--start='));
const START_INDEX = startArg ? parseInt(startArg.split('=')[1], 10) : 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatNpwr(index) {
  return `NPWR${index.toString().padStart(5, '0')}_00`;
}

function appendValidLog(npwrId, title, platform) {
  const line = `${npwrId} - ${title} [${platform}]\n`;
  fs.appendFileSync(VALID_LOG, line);
}

function needsNpServiceName(platform) {
  if (!platform || typeof platform !== 'string') return false;
  const legacyPlatforms = ['PS3', 'PS4', 'PSVITA', 'PS Vita'];
  return legacyPlatforms.some(p => platform.includes(p));
}

async function scrapeNpwrId(accessToken, npwrId) {
  const filePath = path.join(OUTPUT_DIR, `${npwrId}.json`);
  if (fs.existsSync(filePath)) return;

  try {
    const trophyGroups = await getTitleTrophyGroups(accessToken, npwrId, {
      npServiceName: 'trophy'
    });

    const platform = trophyGroups.trophyTitlePlatform;
    const title = trophyGroups.trophyTitleName;

    const options = needsNpServiceName(platform) ? { npServiceName: 'trophy' } : {};

    const allTrophies = await getTitleTrophies(accessToken, npwrId, 'all', options);

    if (!allTrophies || !Array.isArray(allTrophies.trophies)) {
      console.log(`${npwrId} returned invalid trophies data.`);
      return;
    }

    const data = {
      npCommunicationId: npwrId,
      title,
      platform,
      trophySetVersion: allTrophies.trophySetVersion,
      hasTrophyGroups: allTrophies.hasTrophyGroups,
      totalItemCount: allTrophies.totalItemCount,
      trophies: allTrophies.trophies
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    appendValidLog(npwrId, title, platform);
    console.log(`${npwrId} saved`);
  } catch (err) {
    console.log(`${npwrId} skipped: ${err.message}`);
  }
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

  const authCode = await exchangeNpssoForCode(NPSSO);
  const accessToken = await exchangeCodeForAccessToken(authCode);

  const queue = [];
  for (let i = START_INDEX; i <= END_INDEX; i++) {
    queue.push(formatNpwr(i));
  }

  let index = 0;

  async function runBatch() {
    if (index >= queue.length) return false;

    const batch = [];
    for (let i = 0; i < CONCURRENT_LIMIT && index < queue.length; i++, index++) {
      const npwrId = queue[index];
      batch.push(scrapeNpwrId(accessToken, npwrId));
    }

    await Promise.all(batch);
    return true;
  }

  console.log(`Starting scrape from ${formatNpwr(START_INDEX)} to ${formatNpwr(END_INDEX)}...`);

  while (await runBatch()) {
    await sleep(BATCH_DELAY_MS);
  }

  console.log('Scraping completed!');
}

main();