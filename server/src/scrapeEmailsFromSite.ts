/**
 * EmailScraper - Efficient email extraction utility for Cloudflare Workers
 */

// Core email regex pattern
const EMAIL_REGEX = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

// Common patterns to exclude
const EMAIL_EXCLUSIONS = [
  '.png', '.jpg', '.gif', '.jpeg', '.webp',
  'example.com', 'domain.com', 'yourdomain',
  '@example', '@test', '@sample',
  'email@', 'user@',
];

// Configuration interface
interface EmailScraperConfig {
  concurrency?: number;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  excludePatterns?: string[];
  userAgent?: string;
}

// Result type definition
interface ScrapingResult {
  url: string;
  emails: string[];
  success: boolean;
  error?: string;
}

export class EmailScraper {
  private config: Required<EmailScraperConfig>;
  private controller: AbortController;
  
  constructor(config: EmailScraperConfig = {}) {
    this.config = {
      concurrency: config.concurrency || 10,
      timeout: config.timeout || 10000,
      maxRetries: config.maxRetries || 2,
      retryDelay: config.retryDelay || 1000,
      excludePatterns: [...EMAIL_EXCLUSIONS, ...(config.excludePatterns || [])],
      userAgent: config.userAgent || 'Mozilla/5.0 (compatible; EmailScraper/1.0)'
    };
    
    this.controller = new AbortController();
  }
  
  async scrapeEmails(sites: { title: string; link: string }[]): Promise<ScrapingResult[]> {
    const results: ScrapingResult[] = [];
    const batches = this.chunkArray(sites, this.config.concurrency);
    
    for (const batch of batches) {
      const batchPromises = batch.map(site => 
        this.processSite(site.link).then(result => {
          results.push(result);
          return result;
        })
      );
      
      await Promise.all(batchPromises);
    }
    
    return results;
  }
  
  cancel(): void {
    this.controller.abort();
    this.controller = new AbortController();
  }
  
  private async processSite(url: string): Promise<ScrapingResult> {
    let attempts = 0;
    
    while (attempts <= this.config.maxRetries) {
      try {
        const response = await this.fetchWithTimeout(url, {
          headers: {
            'User-Agent': this.config.userAgent,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: this.controller.signal,
          timeout: this.config.timeout
        });
        
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        
        const html = await response.text();
        const emails = this.extractEmails(html);
        
        return { url, emails, success: true };
      } catch (error: any) {
        attempts++;
        
        if (attempts > this.config.maxRetries) {
          return {
            url,
            emails: [],
            success: false,
            error: error.message || 'Unknown error'
          };
        }
        
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
      }
    }
    
    return { url, emails: [], success: false, error: 'Maximum retries exceeded' };
  }
  
  private extractEmails(html: string): string[] {
    const matches = html.match(EMAIL_REGEX) || [];
    
    return [...new Set(matches)]
      .filter(email => {
        if (!email.includes('@')) return false;
        
        for (const pattern of this.config.excludePatterns) {
          if (email.toLowerCase().includes(pattern.toLowerCase())) {
            return false;
          }
        }
        
        return true;
      });
  }
  
  private async fetchWithTimeout(
    url: string, 
    options: RequestInit & { timeout?: number } = {}
  ): Promise<Response> {
    const { timeout, ...fetchOptions } = options;
    
    if (timeout) {
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), timeout);
      
      const combinedSignal = this.createCombinedAbortSignal(
        options.signal as AbortSignal, 
        timeoutController.signal
      );
      
      try {
        return await fetch(url, {
          ...fetchOptions,
          signal: combinedSignal
        });
      } finally {
        clearTimeout(timeoutId);
      }
    }
    
    return fetch(url, fetchOptions);
  }
  
  private createCombinedAbortSignal(...signals: (AbortSignal | undefined)[]): AbortSignal {
    const controller = new AbortController();
    
    for (const signal of signals) {
      if (!signal) continue;
      
      if (signal.aborted) {
        controller.abort(signal.reason);
        break;
      }
      
      signal.addEventListener('abort', () => {
        controller.abort(signal.reason);
      }, { once: true });
    }
    
    return controller.signal;
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Singleton instance
let scraperInstance: EmailScraper | null = null;

export function getEmailScraper(config?: EmailScraperConfig): EmailScraper {
  if (!scraperInstance) {
    scraperInstance = new EmailScraper(config);
  }
  return scraperInstance;
}

export async function scrapeEmailsFromSites(
  sites: { title: string; link: string }[],
  config?: EmailScraperConfig
): Promise<ScrapingResult[]> {
  const scraper = getEmailScraper(config);
  return scraper.scrapeEmails(sites);
}