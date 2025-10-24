/*
  Scrape repositories that depend on scaffold-eth/burner-connector using Puppeteer
  and save the data to PostgreSQL database.
*/

import puppeteer from 'puppeteer';
import {
  delay,
  fetchRepoMeta,
  pool,
  processRepositories,
  setupGracefulShutdown,
  type RepositoryData
} from './common';

const BASE_URL = 'https://github.com/scaffold-eth/burner-connector/network/dependents?dependent_type=REPOSITORY';

(async () => {
    setupGracefulShutdown();

    const browser = await puppeteer.launch({ headless: true });
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
        const repos: string[] = await page.evaluate(`
            (() => {
                const rows = document.querySelectorAll('.Box-row');
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

                return Array.from(rows).map(row => {
                    const repoLink = row.querySelector('a[data-hovercard-type="repository"]');
                    const ownerLink = row.querySelector('a[data-hovercard-type="user"]') || row.querySelector('a[data-hovercard-type="organization"]');

                    const name = repoLink?.textContent?.trim();
                    const owner = ownerLink?.textContent?.trim();

                    return owner && name ? owner + '/' + name : name;
                });
            })()
        `) as string[];

        results.push(...(repos as string[]));
        console.log(`Scraped page ${pageNum}, repos on this page: ${repos.length}, total collected: ${results.length}`);
        if (repos.length > 0) {
            console.log(`First repo on this page: ${repos[0]}`);
            console.log(`Last repo on this page: ${repos[repos.length - 1]}`);
        } else {
            console.log('No repos found on this page.');
        }

        // Add a delay to be polite and avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2500));

        // Find the next page link robustly
        const nextHref = await page.evaluate(() => {
            const byRel = document.querySelector('a[rel="next"]');
            if (byRel && !(byRel.classList && byRel.classList.contains('disabled'))) {
                return byRel.getAttribute('href');
            }
            const candidates = Array.from(document.querySelectorAll('a.BtnGroup-item, a.next_page'));
            const nextBtn = candidates.find(btn => btn.textContent && btn.textContent.trim().toLowerCase().startsWith('next') && !btn.classList.contains('disabled'));
            return nextBtn ? nextBtn.getAttribute('href') : null;
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
    const uniqueResults = Array.from(new Set(results));

    // Enrich repositories sequentially
    const enriched: RepositoryData[] = [];
    for (let i = 0; i < uniqueResults.length; i++) {
      const full = uniqueResults[i];
      console.log(`Processing ${full} (${i + 1} of ${uniqueResults.length})`);
      const meta = await fetchRepoMeta(full);
      if (meta) {
        enriched.push({
          full_name: meta.full_name,
          name: meta.name,
          owner: meta.owner.login,
          url: meta.html_url,
          homepage: meta.homepage,
          stars: meta.stargazers_count,
          forks: meta.forks_count,
          created_at: meta.created_at,
          updated_at: meta.updated_at,
          source: ['scrape-dependents'],
        });
      }
      // Pace between calls to reduce abuse detection
      await delay(800);
    }

    await processRepositories(enriched);

    await pool.end();
    await browser.close();
})();
