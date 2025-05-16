import { Hono } from 'hono';
import { Context } from 'hono';
import axios from 'axios';
import { cors } from 'hono/cors';

const app = new Hono();
app.use('*', cors({
  origin: '*', // Or specify your frontend domain like 'https://example.com'
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}))

const SERP_API_KEY = '75ba61b2ee44c0fa928ae3922f094057da0445c2c87e8fdde2e426149cebb455';
// const RESULTS_PER_PAGE = 100;
let requestCount = 0;

app.post('/getWebsites', async (c: Context) => {
  const { keyword, region, count } = await c.req.json();

  if (!keyword || !region || !count) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const query = `${keyword} ${region}`;
//   const totalPages = Math.ceil(count / RESULTS_PER_PAGE);

  const urls = Array.from({ length: 1 }).map((_, index) => {
    // const start = index * RESULTS_PER_PAGE;
    return `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&start=${1}&num=${Math.min(count, 100)}&api_key=${SERP_API_KEY}`;
  });

  try {
    const responses = await Promise.all(
      urls.map(url => axios.get(url))
    );

	// const responses = await axios.get(urls.map((url) => url));

    // Collect all results
    const allResults: { title: string; link: string }[] = [];
    for (const res of responses) {
      const organicResults = res.data.organic_results || [];
      for (const item of organicResults) {
        if (item.title && item.link) {
          allResults.push({ title: item.title, link: item.link });
        }
      }
    }

    // Deduplicate by link
    const seenLinks = new Set<string>();
    const uniqueResults = allResults.filter(item => {
      if (seenLinks.has(item.link)) return false;
      seenLinks.add(item.link);
      return true;
    });
	requestCount++;
    return c.json(uniqueResults.slice(0, count));
  } catch (error: any) {
    console.error('Error fetching from SerpAPI:', error.message);
    return c.json({ error: 'Failed to fetch data from SerpAPI' }, 500);
  }
});

app.post('/checkSite', async (c) => {
  try {
    const { url } = await c.req.json();

    if (!url) {
      return c.json({ error: "Missing URL" }, 400);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000); // 7s timeout

    let isDomainActive = false;
    let loadsFast = false;

    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal
      });

      const duration = Date.now() - start;

      if (res.ok) {
        isDomainActive = true;
        loadsFast = duration <= 5000; // 5 seconds
      }
    } catch (err) {
      console.warn("Site check failed:", url, err);
    } finally {
      clearTimeout(timeout);
    }

    return c.json({ isDomainActive, loadsFast });
  } catch (err) {
    return c.json({ error: "Invalid request" }, 400);
  }
});

// app.post('/fetchEmail', async (c: Context) => {
//   try {
//     const body = await c.req.json();
//     const inputLinks = body.links || [];
    
//     // Basic validation
//     if (!Array.isArray(inputLinks) || inputLinks.length === 0) {
//       return c.json({ error: 'Invalid input: links array is required' }, 400);
//     }
    
//     // Process URLs, but limit to a reasonable number
//     const linksToProcess = inputLinks.slice(0, 20); // Maximum 20 URLs per request
    
//     const results = await Promise.all(
//       linksToProcess.map(async ({ title, link }) => {
//         if (!link) {
//           return { title, link, emails: [] };
//         }
        
//         // 1. Normalize the URL (strip path, query, hash)
//         let baseUrl: string;
//         try {
//           const parsed = new URL(link);
//           baseUrl = `${parsed.protocol}//${parsed.hostname}/`;
//         } catch (err) {
//           return { title, link, emails: [], status: 'error', error: 'Invalid URL' };
//         }
        
//         // Check cache first
//         const cacheKey = baseUrl;
//         if (EMAIL_CACHE.has(cacheKey)) {
//           const { emails, timestamp } = EMAIL_CACHE.get(cacheKey);
//           // Use cache if still valid
//           if (Date.now() - timestamp < CACHE_TTL) {
//             return { 
//               title, 
//               link: baseUrl, 
//               emails,
//               status: emails.length > 0 ? 'found' : 'not_found'
//             };
//           }
//           // Otherwise remove expired cache entry
//           EMAIL_CACHE.delete(cacheKey);
//         }
        
//         // 2. Fetch the homepage HTML with a timeout
//         const emails = await fetchEmailFromUrl(baseUrl);
        
//         // If no emails found, try contact pages
//         let allEmails = [...emails];
//         if (emails.length === 0) {
//           for (const path of CONTACT_PATHS) {
//             if (allEmails.length > 0) break;
//             const contactUrl = `${baseUrl}${path}`;
//             const contactEmails = await fetchEmailFromUrl(contactUrl);
//             allEmails = [...allEmails, ...contactEmails];
//           }
//         }
        
//         // Store in cache
//         allEmails = [...new Set(allEmails)]; // Remove duplicates
//         EMAIL_CACHE.set(cacheKey, { emails: allEmails, timestamp: Date.now() });
        
//         return { 
//           title, 
//           link: baseUrl, 
//           emails: allEmails,
//           status: allEmails.length > 0 ? 'found' : 'not_found'
//         };
//       })
//     );
    
//     return c.json({ 
//       results,
//       metadata: {
//         processed: results.length,
//         success: results.filter(r => r.emails && r.emails.length > 0).length
//       }
//     });
//   } catch (err) {
//     console.error('Error in fetchEmail endpoint:', err);
//     return c.json({ error: 'Internal server error' }, 500);
//   }
// });

export default app;
