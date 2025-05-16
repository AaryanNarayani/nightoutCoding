import { scraper } from "scrappy";
import { Readable } from "stream";
import { Buffer } from "buffer";
import * as plugins from "scrappy/dist/plugins";


interface LinkState {
  title: string;
  link: string;
}

interface ScrapedResult {
  title: string;
  link: string;
  emails: string[];
}

const EMAIL_REGEX = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

const timeoutPromise = (ms: number) => new Promise((_, reject) => {
  setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
});

const fetchEmails = async (linkState: LinkState): Promise<string[]> => {
  try {
    const emails = await scrapeEmailsFromUrl(linkState.link);
    console.log(`📧 Emails found in ${linkState.title} (${linkState.link}): ${emails.length ? emails.join(", ") : "None"}`);
    return emails;
  } catch (error) {
    console.error(`🔴 Error fetching emails from ${linkState.link}:`, error);
    return [];
  }
};

const scrape = scraper({
  request: async (url: string) => {
    const res = await fetch(url);
    const htmlText = await res.text();
    return {
      url: res.url,
      status: res.status,
      headers: res.headers as any,
      body: Readable.from(Buffer.from(htmlText)),
    };
  },
  plugins: [plugins.htmlmetaparser, plugins.exifdata],
});

async function safeFetch(url: string): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
    
    const response = await Promise.race([
      fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      }),
      timeoutPromise(5000) 
    ]) as Response;
    
    clearTimeout(timeoutId);
    return response;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error(`⏱️ Request timeout for ${url}`);
    } else if (err.message?.includes("terminated")) {
      console.error(`🔌 Connection terminated by remote host for ${url}`);
    } else if (err.code === "UND_ERR_SOCKET") {
      console.error(`🔌 Socket error on ${url}:`, err.cause?.message || err.message);
    } else {
      console.error(`❌ Failed to fetch ${url}:`, err.message);
    }
    return null;
  }
}

function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) || [];
  const filtered = matches.filter(
    (email) => email.includes("@") && !email.endsWith(".png") && !email.endsWith(".jpg")
  );
  return [...new Set(filtered)];
}

async function scrapeEmailsFromUrl(url: string): Promise<string[]> {
  try {

    if (!url || !url.startsWith('http')) {
      console.warn(`⚠️ Invalid URL: ${url}`);
      return [];
    }
    
    const res = await safeFetch(url);
    if (!res) return [];
    

    if (!res.ok) {
      console.warn(`⚠️ Non-successful response (${res.status}) for ${url}`);
      return [];
    }
    
    let htmlText;
    try {
      htmlText = await res.text();
    } catch (err) {
      console.error(`❌ Failed to read response body from ${url}:`, err);
      return [];
    }
    
    const emails = extractEmails(htmlText);

    try {
      const htmlStream = Readable.from(Buffer.from(htmlText));
      await scrape({
        url: res.url,
        status: res.status,
        headers: res.headers as any,
        body: htmlStream,
      });
    } catch (scrapeErr) {

    }
    
    return emails;
  } catch (err) {
    console.error(`⚠️ Scraping failed for ${url}:`, err);
    return [];
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  handler: (item: T) => Promise<R>,
  limit = 10
): Promise<R[]> {
  const results: R[] = [];
  let activeCount = 0;
  let index = 0;
  
  // Add delay between requests to prevent overwhelming servers
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  return new Promise(async (resolve) => {
    const runNext = async () => {
      if (index >= items.length) {
        if (activeCount === 0) resolve(results);
        return;
      }
      
      const currentIndex = index++;
      activeCount++;
      
      try {
        // Add small random delay between requests
        await delay(Math.random() * 200);
        const result = await handler(items[currentIndex]);
        results.push(result);
      } catch (error) {
        console.error(`Error in worker for item ${currentIndex}:`, error);
      } finally {
        activeCount--;
        runNext();
      }
    };
    
    // Start initial batch of workers
    const initialWorkers = Math.min(limit, items.length);
    for (let i = 0; i < initialWorkers; i++) {
      runNext();
    }
  });
}

/**
 * Process a batch of URLs and extract emails from them
 * @param links Array of LinkState objects containing titles and URLs
 * @param options Configuration options
 * @returns Array of ScrapedResult objects containing titles, links and found emails
 */
export async function processUrlBatch(
  links: LinkState[],
  options: {
    batchSize?: number;
    concurrency?: number;
    delayBetweenBatches?: number;
    saveToFile?: boolean;
    outputFilename?: string;
  } = {}
): Promise<ScrapedResult[]> {
  const {
    batchSize = 50,
    concurrency = 10,
    delayBetweenBatches = 3000,
    saveToFile = false,
    outputFilename = 'scraped_results.json'
  } = options;
  
  console.log(`🚀 Starting to scrape emails from ${links.length} URLs...`);
  
  const allResults: ScrapedResult[] = [];
  
  for (let i = 0; i < links.length; i += batchSize) {
    const batch = links.slice(i, i + batchSize);
    console.log(`\n📦 Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(links.length/batchSize)} (${batch.length} items)`);
    
    try {
      const batchResults = await runWithConcurrency(
        batch,
        async (item) => {
          return {
            title: item.title,
            link: item.link,
            emails: await fetchEmails(item)
          };
        },
        concurrency
      );
      
      // Add batch results to overall results (only those with emails)
      batchResults.forEach(result => {
        if (result.emails.length > 0) {
          allResults.push(result);
        }
      });
      
      // Progress report
      const totalEmails = allResults.reduce((acc, result) => acc + result.emails.length, 0);
      console.log(`✅ Batch complete. Total sites with emails: ${allResults.length}, Total emails found: ${totalEmails}`);
      
      // Add delay between batches
      if (i + batchSize < links.length) {
        console.log(`😴 Taking a short break to avoid rate limiting...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    } catch (error) {
      console.error(`❌ Error processing batch:`, error);
      console.log(`⚠️ Continuing with next batch...`);
    }
  }
  
  console.log(`\n🎉 Scraping completed! Found ${allResults.length} sites with emails.`);
  
  // Save to file if requested
  if (saveToFile) {
    try {
      const fs = require('fs');
      fs.writeFileSync(outputFilename, JSON.stringify(allResults, null, 2));
      console.log(`💾 Results saved to ${outputFilename}`);
    } catch (err) {
      console.error(`❌ Could not save results to file:`, err);
    }
  }
  
  return allResults;
}

// Export all the utility functions
export {
  fetchEmails,
  scrapeEmailsFromUrl,
  extractEmails,
  runWithConcurrency,
  safeFetch
};