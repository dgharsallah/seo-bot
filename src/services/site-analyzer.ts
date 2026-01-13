import axios from 'axios';
import * as cheerio from 'cheerio';
import { SiteAnalysis, PageInfo } from '../types';

export class SiteAnalyzer {
  private visitedUrls: Set<string> = new Set();
  private maxPages: number;

  constructor(maxPages: number = 20) {
    this.maxPages = maxPages;
  }

  async analyze(url: string): Promise<SiteAnalysis> {
    const baseUrl = new URL(url);
    const pages = await this.crawlSite(url);

    const mainPage = pages[0];
    const allTopics = this.extractTopics(pages);
    const niche = await this.detectNiche(mainPage, allTopics);

    return {
      url: baseUrl.origin,
      title: mainPage?.title || '',
      description: await this.extractDescription(url),
      niche,
      mainTopics: allTopics.slice(0, 10),
      existingContent: pages,
      competitors: [], // Would need external API for competitor data
      targetAudience: this.inferTargetAudience(niche, allTopics),
      language: this.detectLanguage(mainPage),
      analyzedAt: new Date(),
    };
  }

  private async crawlSite(startUrl: string): Promise<PageInfo[]> {
    const pages: PageInfo[] = [];
    const toVisit: string[] = [startUrl];
    const baseUrl = new URL(startUrl);

    while (toVisit.length > 0 && pages.length < this.maxPages) {
      const url = toVisit.shift()!;

      if (this.visitedUrls.has(url)) continue;
      this.visitedUrls.add(url);

      try {
        const pageInfo = await this.fetchPage(url, baseUrl.origin);
        if (pageInfo) {
          pages.push(pageInfo);

          // Add internal links to crawl queue
          for (const link of pageInfo.internalLinks) {
            if (!this.visitedUrls.has(link) && !toVisit.includes(link)) {
              toVisit.push(link);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to fetch ${url}:`, error);
      }
    }

    return pages;
  }

  private async fetchPage(url: string, baseOrigin: string): Promise<PageInfo | null> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'SEOBot/1.0 (Internal Tool)',
        },
      });

      const $ = cheerio.load(response.data);

      // Remove script and style elements
      $('script, style, nav, footer, header').remove();

      const title = $('title').text().trim() || $('h1').first().text().trim();
      const headings = this.extractHeadings($);
      const text = $('body').text();
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

      const links = this.extractLinks($, url, baseOrigin);

      return {
        url,
        title,
        headings,
        wordCount,
        internalLinks: links.internal,
        externalLinks: links.external,
      };
    } catch {
      return null;
    }
  }

  private extractHeadings($: cheerio.CheerioAPI): string[] {
    const headings: string[] = [];
    $('h1, h2, h3').each((_, el) => {
      const text = $(el).text().trim();
      if (text) headings.push(text);
    });
    return headings;
  }

  private extractLinks(
    $: cheerio.CheerioAPI,
    currentUrl: string,
    baseOrigin: string
  ): { internal: string[]; external: string[] } {
    const internal: string[] = [];
    const external: string[] = [];

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      try {
        const absoluteUrl = new URL(href, currentUrl);
        const cleanUrl = absoluteUrl.origin + absoluteUrl.pathname;

        if (absoluteUrl.origin === baseOrigin) {
          if (!internal.includes(cleanUrl)) {
            internal.push(cleanUrl);
          }
        } else if (absoluteUrl.protocol.startsWith('http')) {
          if (!external.includes(cleanUrl)) {
            external.push(cleanUrl);
          }
        }
      } catch {
        // Invalid URL, skip
      }
    });

    return { internal, external };
  }

  private async extractDescription(url: string): Promise<string> {
    try {
      const response = await axios.get(url, { timeout: 10000 });
      const $ = cheerio.load(response.data);

      return (
        $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        $('p').first().text().trim().slice(0, 160) ||
        ''
      );
    } catch {
      return '';
    }
  }

  private extractTopics(pages: PageInfo[]): string[] {
    const topicCounts = new Map<string, number>();

    for (const page of pages) {
      for (const heading of page.headings) {
        const normalized = heading.toLowerCase().trim();
        if (normalized.length > 3 && normalized.length < 100) {
          topicCounts.set(normalized, (topicCounts.get(normalized) || 0) + 1);
        }
      }
    }

    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic);
  }

  private async detectNiche(page: PageInfo | undefined, topics: string[]): Promise<string> {
    if (!page) return 'general';

    const content = [page.title, ...page.headings, ...topics.slice(0, 5)].join(' ').toLowerCase();

    const nichePatterns: Record<string, string[]> = {
      'technology': ['software', 'tech', 'app', 'digital', 'ai', 'code', 'developer'],
      'e-commerce': ['shop', 'store', 'buy', 'product', 'cart', 'price'],
      'health': ['health', 'wellness', 'medical', 'fitness', 'nutrition'],
      'finance': ['finance', 'money', 'invest', 'bank', 'trading', 'crypto'],
      'education': ['learn', 'course', 'tutorial', 'training', 'education'],
      'marketing': ['marketing', 'seo', 'growth', 'brand', 'advertising'],
      'saas': ['saas', 'platform', 'tool', 'automation', 'workflow'],
    };

    let bestMatch = 'general';
    let highestScore = 0;

    for (const [niche, patterns] of Object.entries(nichePatterns)) {
      const score = patterns.filter(p => content.includes(p)).length;
      if (score > highestScore) {
        highestScore = score;
        bestMatch = niche;
      }
    }

    return bestMatch;
  }

  private inferTargetAudience(niche: string, topics: string[]): string {
    const audienceMap: Record<string, string> = {
      'technology': 'developers and tech professionals',
      'e-commerce': 'online shoppers and retail businesses',
      'health': 'health-conscious individuals',
      'finance': 'investors and finance professionals',
      'education': 'students and lifelong learners',
      'marketing': 'marketers and business owners',
      'saas': 'businesses and professionals seeking productivity tools',
      'general': 'general audience',
    };

    return audienceMap[niche] || audienceMap['general'];
  }

  private detectLanguage(page: PageInfo | undefined): string {
    // Simple heuristic - could be enhanced with actual language detection
    return 'en';
  }
}

export const siteAnalyzer = new SiteAnalyzer();
