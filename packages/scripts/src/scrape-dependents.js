const puppeteer = require('puppeteer');
const fs = require('fs');

const BASE_URL = 'https://github.com/scaffold-eth/burner-connector/network/dependents?dependent_type=REPOSITORY';

(async () => {
    const browser = await puppeteer.launch({ headless: true }); // Keep headless: false for debugging!
    const page = await browser.newPage();

    // Set a higher default timeout for all Puppeteer operations on this page
    page.setDefaultNavigationTimeout(60000); // 60 seconds
    page.setDefaultTimeout(30000); // 30 seconds for other operations like waitForSelector

    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    let results = [];
    let pageNum = 1;

    // Keep track of visited URLs to prevent infinite loops (if pagination gets circular)
    const visitedUrls = new Set();
    visitedUrls.add(page.url()); // Add the initial URL

    while (true) {
        console.log(`--- Scraping page: ${pageNum} ---`);
        console.log(`Current page URL: ${page.url()}`);

        // Important: Wait for the content to be loaded on the *current* page.
        try {
            await page.waitForSelector('.Box-row', { timeout: 20000 });
        } catch (error) {
            console.log(`Timeout waiting for .Box-row on page ${pageNum}. Assuming no more pages or an issue.`);
            break;
        }

        // Scrape current page
        const repos = await page.$$eval('.Box-row', rows => {
            const getCount = (span) => {
                if (!span) return 0;
                for (const node of span.childNodes) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const num = parseInt(node.textContent.replace(/,/g, '').trim(), 10);
                        if (!isNaN(num)) return num;
                    }
                }
                return 0;
            };

            return rows.map(row => {
                const repoLink = row.querySelector('a[data-hovercard-type="repository"]');
                const ownerLink = row.querySelector('a[data-hovercard-type="user"]') || row.querySelector('a[data-hovercard-type="organization"]');
                const starsSpan = row.querySelector('svg.octicon-star')?.parentElement;
                const forksSpan = row.querySelector('svg.octicon-repo-forked')?.parentElement;

                const name = repoLink?.innerText.trim();
                const owner = ownerLink?.innerText.trim();
                const url = repoLink?.href;

                const stars = getCount(starsSpan);
                const forks = getCount(forksSpan);

                return {
                    full_name: owner && name ? `${owner}/${name}` : name,
                    name: name,
                    owner: owner,
                    url: url,
                    stars: stars,
                    forks: forks
                };
            });
        });

        results.push(...repos);
        console.log(`Scraped page ${pageNum}, repos on this page: ${repos.length}, total collected: ${results.length}`);
        if (repos.length > 0) {
            console.log(`First repo on this page: ${repos[0].full_name}`);
            console.log(`Last repo on this page: ${repos[repos.length - 1].full_name}`);
        } else {
            console.log('No repos found on this page.');
        }

        // Add a delay to be polite and avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2500));

        // Find the next page link robustly
        const nextHref = await page.evaluate(() => {
            const byRel = document.querySelector('a[rel="next"]');
            if (byRel && !(byRel.classList && byRel.classList.contains('disabled'))) {
                return byRel.href;
            }
            const candidates = Array.from(document.querySelectorAll('a.BtnGroup-item, a.next_page'));
            const nextBtn = candidates.find(btn => btn.textContent && btn.textContent.trim().toLowerCase().startsWith('next') && !btn.classList.contains('disabled'));
            return nextBtn ? nextBtn.href : null;
        });

        if (nextHref) {
            // Guard against circular pagination
            if (visitedUrls.has(nextHref)) {
                console.log(`Detected repeated next URL (${nextHref}). Ending scraping to avoid loop.`);
                break;
            }
            visitedUrls.add(nextHref);
            console.log(`Navigating to next page: ${nextHref}`);
            pageNum++;
            await page.goto(nextHref, { waitUntil: 'networkidle2', timeout: 60000 });
        } else {
            console.log("No more 'Next' button found. Ending scraping.");
            break;
        }
    }

    // Remove duplicates
    const uniqueResults = Array.from(new Map(results.map(r => [r.url, r])).values());

    // Save to CSV
    const csvContent = [
        'full_name,name,owner,url,stars,forks',
        ...uniqueResults.map(r => `"${r.full_name || r.name}","${r.name || ''}","${r.owner || ''}","${r.url || ''}",${r.stars || 0},${r.forks || 0}`)
    ].join('\n');

    fs.writeFileSync('dependents.csv', csvContent);
    console.log(`Saved ${uniqueResults.length} unique dependents to dependents.csv`);

    await browser.close();
})();
