import OpenAI from 'openai';
import slugify from 'slugify';
import { config } from '../config';
import {
  GeneratedArticle,
  ContentGenerationOptions,
  ContentOutline,
  InternalLink,
  PageInfo
} from '../types';

export class ContentGenerator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
  }

  async generateArticle(options: ContentGenerationOptions): Promise<GeneratedArticle> {
    const outline = await this.generateOutline(options);
    const content = await this.generateContent(outline, options);
    const metaDescription = await this.generateMetaDescription(content, options.targetKeyword);

    const wordCount = content.split(/\s+/).length;
    const readingTime = Math.ceil(wordCount / 200);

    return {
      title: outline.introduction.split('\n')[0].replace(/^#\s*/, ''),
      slug: slugify(options.targetKeyword, { lower: true, strict: true }),
      metaDescription,
      content,
      targetKeyword: options.targetKeyword,
      secondaryKeywords: options.secondaryKeywords || [],
      wordCount,
      readingTime,
      generatedAt: new Date(),
      suggestedInternalLinks: [],
    };
  }

  private async generateOutline(options: ContentGenerationOptions): Promise<ContentOutline> {
    const prompt = `Create a detailed content outline for an SEO-optimized article about "${options.targetKeyword}".

Requirements:
- Target word count: ${options.targetWordCount || config.maxArticleWords} words
- Tone: ${options.tone || 'professional'}
- Include secondary keywords naturally: ${options.secondaryKeywords?.join(', ') || 'none specified'}
${options.includeFAQ ? '- Include an FAQ section' : ''}
${options.customInstructions ? `- Additional instructions: ${options.customInstructions}` : ''}

Return a JSON object with this structure:
{
  "introduction": "Brief description of intro paragraph focus",
  "sections": [
    {
      "heading": "H2 heading text",
      "subheadings": ["H3 subheading 1", "H3 subheading 2"],
      "keyPoints": ["Point to cover", "Another point"]
    }
  ],
  "conclusion": "Brief description of conclusion focus"
}

Create 4-6 main sections. Only return valid JSON.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || '{}';
    return JSON.parse(this.cleanJsonResponse(content));
  }

  private async generateContent(
    outline: ContentOutline,
    options: ContentGenerationOptions
  ): Promise<string> {
    const prompt = `Write a comprehensive, SEO-optimized article based on this outline:

${JSON.stringify(outline, null, 2)}

Requirements:
- Primary keyword: "${options.targetKeyword}" (use naturally 3-5 times)
- Secondary keywords: ${options.secondaryKeywords?.join(', ') || 'none'}
- Target length: ${options.targetWordCount || config.maxArticleWords} words
- Tone: ${options.tone || 'professional'}
- Language: ${options.language || config.defaultLanguage}

Writing guidelines:
1. Start with an engaging introduction that includes the primary keyword
2. Use H2 for main sections, H3 for subsections
3. Write in a clear, readable style with short paragraphs
4. Include actionable tips and examples where relevant
5. Use bullet points and numbered lists for clarity
6. End with a strong conclusion that summarizes key points
7. Do NOT include any meta information, just the article content
8. Format in Markdown

${options.includeFAQ ? 'Include a "Frequently Asked Questions" section with 4-5 Q&As at the end.' : ''}
${options.customInstructions || ''}

Write the complete article now:`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4000,
    });

    return response.choices[0]?.message?.content || '';
  }

  private async generateMetaDescription(content: string, keyword: string): Promise<string> {
    const prompt = `Write a compelling meta description for an article about "${keyword}".

The description should:
- Be 150-160 characters
- Include the keyword naturally
- Encourage clicks
- Summarize the article's value

Article excerpt: ${content.slice(0, 500)}

Return only the meta description text, no quotes.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content?.trim() || '';
  }

  async suggestInternalLinks(
    article: GeneratedArticle,
    existingPages: PageInfo[]
  ): Promise<InternalLink[]> {
    if (existingPages.length === 0) return [];

    const pageList = existingPages
      .slice(0, 20)
      .map(p => `- ${p.title}: ${p.url}`)
      .join('\n');

    const prompt = `Analyze this article content and suggest internal links to these existing pages:

Article keyword: ${article.targetKeyword}
Article excerpt: ${article.content.slice(0, 1000)}

Existing pages:
${pageList}

Suggest 3-5 relevant internal links. Return a JSON array:
[
  {
    "anchorText": "natural anchor text from article",
    "targetUrl": "matching URL from list above",
    "context": "sentence where link should be placed"
  }
]

Only return valid JSON.`;

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

  async improveContent(
    content: string,
    feedback: string
  ): Promise<string> {
    const prompt = `Improve this article based on the following feedback:

Feedback: ${feedback}

Original article:
${content}

Return the improved article in full. Maintain the same format and structure unless the feedback requires changes.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4000,
    });

    return response.choices[0]?.message?.content || content;
  }

  private cleanJsonResponse(content: string): string {
    return content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
  }
}

export const contentGenerator = new ContentGenerator();
