import OpenAI from 'openai';
import { config } from '../config';
import { PageInfo, InternalLink } from '../types';

interface LinkOpportunity {
  sourcePage: PageInfo;
  targetPage: PageInfo;
  suggestedAnchor: string;
  relevanceScore: number;
}

export class InternalLinker {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
  }

  async analyzeAndSuggestLinks(pages: PageInfo[]): Promise<LinkOpportunity[]> {
    const opportunities: LinkOpportunity[] = [];

    // Build a relevance matrix between pages
    for (let i = 0; i < pages.length; i++) {
      for (let j = 0; j < pages.length; j++) {
        if (i === j) continue;

        const source = pages[i];
        const target = pages[j];

        // Skip if already linked
        if (source.internalLinks.includes(target.url)) continue;

        const relevance = this.calculateRelevance(source, target);

        if (relevance > 0.3) {
          opportunities.push({
            sourcePage: source,
            targetPage: target,
            suggestedAnchor: this.suggestAnchorText(target),
            relevanceScore: relevance,
          });
        }
      }
    }

    // Sort by relevance and return top opportunities
    return opportunities
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 50);
  }

  private calculateRelevance(source: PageInfo, target: PageInfo): number {
    const sourceWords = new Set(this.extractKeywords(source));
    const targetWords = new Set(this.extractKeywords(target));

    // Calculate Jaccard similarity
    const intersection = new Set([...sourceWords].filter(x => targetWords.has(x)));
    const union = new Set([...sourceWords, ...targetWords]);

    if (union.size === 0) return 0;

    return intersection.size / union.size;
  }

  private extractKeywords(page: PageInfo): string[] {
    const text = [page.title, ...page.headings].join(' ').toLowerCase();

    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'how', 'what',
      'why', 'when', 'where', 'who', 'which', 'this', 'that', 'your', 'our',
    ]);

    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
  }

  private suggestAnchorText(page: PageInfo): string {
    // Use the title or first heading as anchor text
    if (page.title) {
      // Shorten long titles
      const words = page.title.split(' ');
      if (words.length > 5) {
        return words.slice(0, 5).join(' ');
      }
      return page.title;
    }

    if (page.headings.length > 0) {
      return page.headings[0];
    }

    // Extract from URL as last resort
    const urlPath = new URL(page.url).pathname;
    return urlPath
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/-/g, ' ') || 'Read more';
  }

  async generateSmartAnchors(
    sourcePage: PageInfo,
    targetPages: PageInfo[]
  ): Promise<InternalLink[]> {
    const pageDescriptions = targetPages
      .slice(0, 10)
      .map(p => `- "${p.title}" (${p.url}): ${p.headings.slice(0, 3).join(', ')}`)
      .join('\n');

    const prompt = `Analyze this source page and suggest internal links to the target pages.

Source page: "${sourcePage.title}"
Source headings: ${sourcePage.headings.slice(0, 5).join(', ')}

Target pages:
${pageDescriptions}

Suggest 2-4 internal links with natural anchor text. Return JSON array:
[
  {
    "anchorText": "natural phrase to use as link text",
    "targetUrl": "exact URL from list above",
    "context": "suggested sentence context for the link"
  }
]

Only suggest links that make semantic sense. Return valid JSON only.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
      });

      const content = response.choices[0]?.message?.content || '[]';
      return JSON.parse(this.cleanJsonResponse(content));
    } catch {
      return [];
    }
  }

  buildTopicClusters(pages: PageInfo[]): Map<string, PageInfo[]> {
    const clusters = new Map<string, PageInfo[]>();

    for (const page of pages) {
      const mainTopic = this.detectMainTopic(page);

      if (!clusters.has(mainTopic)) {
        clusters.set(mainTopic, []);
      }
      clusters.get(mainTopic)!.push(page);
    }

    return clusters;
  }

  private detectMainTopic(page: PageInfo): string {
    const keywords = this.extractKeywords(page);

    if (keywords.length === 0) return 'general';

    // Count keyword frequencies
    const counts = new Map<string, number>();
    for (const kw of keywords) {
      counts.set(kw, (counts.get(kw) || 0) + 1);
    }

    // Return most frequent keyword as topic
    let maxCount = 0;
    let mainTopic = 'general';

    for (const [word, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mainTopic = word;
      }
    }

    return mainTopic;
  }

  suggestPillarContent(clusters: Map<string, PageInfo[]>): string[] {
    const suggestions: string[] = [];

    for (const [topic, pages] of clusters) {
      if (pages.length >= 3) {
        suggestions.push(
          `Create a pillar page for "${topic}" linking to ${pages.length} related articles`
        );
      }
    }

    return suggestions;
  }

  private cleanJsonResponse(content: string): string {
    return content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
  }
}

export const internalLinker = new InternalLinker();
