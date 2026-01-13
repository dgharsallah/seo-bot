import OpenAI from 'openai';
import { config } from '../config';
import { Keyword, KeywordCluster, SiteAnalysis } from '../types';

export class KeywordResearcher {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
  }

  async researchKeywords(
    siteAnalysis: SiteAnalysis,
    seedKeywords?: string[]
  ): Promise<KeywordCluster[]> {
    const baseKeywords = seedKeywords || this.extractSeedKeywords(siteAnalysis);
    const clusters: KeywordCluster[] = [];

    for (const seedKeyword of baseKeywords.slice(0, 5)) {
      const cluster = await this.generateKeywordCluster(
        seedKeyword,
        siteAnalysis.niche,
        siteAnalysis.targetAudience
      );
      clusters.push(cluster);
    }

    return clusters;
  }

  async generateKeywordCluster(
    mainKeyword: string,
    niche: string,
    targetAudience: string
  ): Promise<KeywordCluster> {
    const prompt = `You are an SEO expert. Generate a keyword cluster for the main keyword "${mainKeyword}" in the ${niche} niche, targeting ${targetAudience}.

Return a JSON object with this exact structure:
{
  "mainKeyword": "${mainKeyword}",
  "relatedKeywords": [
    {
      "keyword": "related keyword here",
      "intent": "informational|navigational|transactional|commercial",
      "relevanceScore": 0.0-1.0
    }
  ],
  "suggestedTopics": ["topic 1", "topic 2", "topic 3"]
}

Generate 10-15 related keywords with varying intents. Include:
- Long-tail variations
- Question-based keywords (how to, what is, why)
- Comparison keywords (vs, alternative, best)
- Action keywords (buy, get, find, learn)

Only return the JSON, no other text.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(this.cleanJsonResponse(content));

      return {
        mainKeyword: parsed.mainKeyword || mainKeyword,
        relatedKeywords: (parsed.relatedKeywords || []).map((kw: any) => ({
          keyword: kw.keyword,
          intent: kw.intent || 'informational',
          relevanceScore: kw.relevanceScore || 0.5,
          suggestedBy: 'related' as const,
        })),
        suggestedTopics: parsed.suggestedTopics || [],
      };
    } catch (error) {
      console.error('Error generating keyword cluster:', error);
      return {
        mainKeyword,
        relatedKeywords: [],
        suggestedTopics: [],
      };
    }
  }

  async suggestContentTopics(
    clusters: KeywordCluster[],
    existingTopics: string[]
  ): Promise<string[]> {
    const allKeywords = clusters.flatMap(c => [
      c.mainKeyword,
      ...c.relatedKeywords.map(k => k.keyword),
    ]);

    const prompt = `Based on these keywords: ${allKeywords.slice(0, 20).join(', ')}

And these existing topics to avoid duplicating: ${existingTopics.slice(0, 10).join(', ')}

Suggest 10 unique blog post topics that would rank well for these keywords.
Focus on topics that:
1. Answer common questions
2. Provide actionable value
3. Have clear search intent
4. Are not already covered by existing topics

Return as a JSON array of strings: ["topic 1", "topic 2", ...]`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
      });

      const content = response.choices[0]?.message?.content || '[]';
      return JSON.parse(this.cleanJsonResponse(content));
    } catch {
      return [];
    }
  }

  private extractSeedKeywords(analysis: SiteAnalysis): string[] {
    const keywords: string[] = [];

    // Extract from title
    if (analysis.title) {
      keywords.push(...this.extractKeywordsFromText(analysis.title));
    }

    // Extract from main topics
    keywords.push(...analysis.mainTopics.slice(0, 5));

    // Add niche as keyword
    if (analysis.niche !== 'general') {
      keywords.push(analysis.niche);
    }

    return [...new Set(keywords)].slice(0, 10);
  }

  private extractKeywordsFromText(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'your', 'our', 'their', 'its', 'this', 'that', 'these', 'those',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
  }

  private cleanJsonResponse(content: string): string {
    // Remove markdown code blocks if present
    return content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
  }

  async findContentGaps(
    siteAnalysis: SiteAnalysis,
    competitorUrls?: string[]
  ): Promise<string[]> {
    const prompt = `Analyze this website's niche and content:
Niche: ${siteAnalysis.niche}
Current topics: ${siteAnalysis.mainTopics.join(', ')}
Target audience: ${siteAnalysis.targetAudience}

Identify 10 content gaps - topics that are important for this niche but appear to be missing.
Return as a JSON array of strings.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content || '[]';
      return JSON.parse(this.cleanJsonResponse(content));
    } catch {
      return [];
    }
  }
}

export const keywordResearcher = new KeywordResearcher();
