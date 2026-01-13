#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { SEOBot } from './index';
import { config, validateConfig, getOutputPath } from './config';
import { GeneratedArticle, SiteAnalysis, KeywordCluster } from './types';

const program = new Command();

program
  .name('seo-bot')
  .description('AI-powered SEO automation tool')
  .version('1.0.0');

// Analyze command
program
  .command('analyze <url>')
  .description('Analyze a website for SEO insights')
  .option('-o, --output <file>', 'Output file for results')
  .option('-p, --pages <number>', 'Max pages to analyze', '20')
  .action(async (url: string, options) => {
    const spinner = ora('Analyzing website...').start();

    try {
      const bot = new SEOBot({ maxPagesToAnalyze: parseInt(options.pages) });
      const analysis = await bot.analyzeSite(url);

      spinner.succeed('Analysis complete!');

      console.log('\n' + chalk.bold('Site Analysis Results'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`${chalk.cyan('URL:')} ${analysis.url}`);
      console.log(`${chalk.cyan('Title:')} ${analysis.title}`);
      console.log(`${chalk.cyan('Niche:')} ${analysis.niche}`);
      console.log(`${chalk.cyan('Target Audience:')} ${analysis.targetAudience}`);
      console.log(`${chalk.cyan('Pages Found:')} ${analysis.existingContent.length}`);
      console.log(`${chalk.cyan('Main Topics:')}`);
      analysis.mainTopics.slice(0, 5).forEach(topic => {
        console.log(`  • ${topic}`);
      });

      if (options.output) {
        await saveOutput(options.output, analysis);
        console.log(`\n${chalk.green('✓')} Results saved to ${options.output}`);
      }
    } catch (error: any) {
      spinner.fail('Analysis failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Keywords command
program
  .command('keywords <url>')
  .description('Research keywords for a website')
  .option('-s, --seed <keywords>', 'Comma-separated seed keywords')
  .option('-o, --output <file>', 'Output file for results')
  .action(async (url: string, options) => {
    const spinner = ora('Researching keywords...').start();

    try {
      const bot = new SEOBot();

      spinner.text = 'Analyzing site...';
      const analysis = await bot.analyzeSite(url);

      spinner.text = 'Generating keyword clusters...';
      const seedKeywords = options.seed?.split(',').map((k: string) => k.trim());
      const clusters = await bot.researchKeywords(analysis, seedKeywords);

      spinner.succeed('Keyword research complete!');

      console.log('\n' + chalk.bold('Keyword Clusters'));
      console.log(chalk.gray('─'.repeat(50)));

      clusters.forEach((cluster: KeywordCluster, i: number) => {
        console.log(`\n${chalk.yellow(`Cluster ${i + 1}:`)} ${chalk.bold(cluster.mainKeyword)}`);
        console.log(chalk.cyan('Related keywords:'));
        cluster.relatedKeywords.slice(0, 5).forEach(kw => {
          console.log(`  • ${kw.keyword} (${kw.intent}, relevance: ${(kw.relevanceScore * 100).toFixed(0)}%)`);
        });
        if (cluster.suggestedTopics.length > 0) {
          console.log(chalk.cyan('Suggested topics:'));
          cluster.suggestedTopics.slice(0, 3).forEach(topic => {
            console.log(`  → ${topic}`);
          });
        }
      });

      if (options.output) {
        await saveOutput(options.output, clusters);
        console.log(`\n${chalk.green('✓')} Results saved to ${options.output}`);
      }
    } catch (error: any) {
      spinner.fail('Keyword research failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Generate command
program
  .command('generate <keyword>')
  .description('Generate an SEO-optimized article')
  .option('-t, --tone <tone>', 'Article tone (professional, casual, technical, friendly)', 'professional')
  .option('-w, --words <number>', 'Target word count', '2000')
  .option('-s, --secondary <keywords>', 'Comma-separated secondary keywords')
  .option('-f, --faq', 'Include FAQ section')
  .option('-o, --output <file>', 'Output file for article')
  .option('-i, --instructions <text>', 'Custom instructions for content')
  .action(async (keyword: string, options) => {
    const spinner = ora('Generating article...').start();

    try {
      const bot = new SEOBot();

      const article = await bot.generateArticle({
        targetKeyword: keyword,
        secondaryKeywords: options.secondary?.split(',').map((k: string) => k.trim()),
        tone: options.tone,
        targetWordCount: parseInt(options.words),
        includeFAQ: options.faq,
        customInstructions: options.instructions,
      });

      spinner.succeed('Article generated!');

      console.log('\n' + chalk.bold('Generated Article'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`${chalk.cyan('Title:')} ${article.title}`);
      console.log(`${chalk.cyan('Slug:')} ${article.slug}`);
      console.log(`${chalk.cyan('Word Count:')} ${article.wordCount}`);
      console.log(`${chalk.cyan('Reading Time:')} ${article.readingTime} min`);
      console.log(`${chalk.cyan('Meta Description:')} ${article.metaDescription}`);

      const outputFile = options.output || `${article.slug}.md`;
      await saveArticle(outputFile, article);
      console.log(`\n${chalk.green('✓')} Article saved to ${outputFile}`);

    } catch (error: any) {
      spinner.fail('Article generation failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Full pipeline command
program
  .command('run <url>')
  .description('Run the full SEO pipeline')
  .option('-g, --generate', 'Also generate content for top opportunity')
  .option('-o, --output <dir>', 'Output directory', './output')
  .action(async (url: string, options) => {
    const spinner = ora('Starting SEO pipeline...').start();

    try {
      const bot = new SEOBot();

      spinner.text = 'Step 1/4: Analyzing site...';
      const analysis = await bot.analyzeSite(url);

      spinner.text = 'Step 2/4: Researching keywords...';
      const clusters = await bot.researchKeywords(analysis);

      spinner.text = 'Step 3/4: Finding content gaps...';
      const gaps = await bot.findContentGaps(analysis);

      spinner.text = 'Step 4/4: Analyzing internal links...';
      const linkOpps = await bot.analyzeInternalLinking(analysis.existingContent);

      spinner.succeed('Pipeline complete!');

      // Summary
      console.log('\n' + chalk.bold('SEO Pipeline Results'));
      console.log(chalk.gray('═'.repeat(50)));

      console.log(`\n${chalk.yellow('Site Analysis:')}`);
      console.log(`  Niche: ${analysis.niche}`);
      console.log(`  Pages analyzed: ${analysis.existingContent.length}`);

      console.log(`\n${chalk.yellow('Keywords:')}`);
      console.log(`  Clusters generated: ${clusters.length}`);
      const totalKeywords = clusters.reduce((sum: number, c: KeywordCluster) => sum + c.relatedKeywords.length, 0);
      console.log(`  Total keywords: ${totalKeywords}`);

      console.log(`\n${chalk.yellow('Content Opportunities:')}`);
      gaps.slice(0, 5).forEach((gap: string) => {
        console.log(`  → ${gap}`);
      });

      console.log(`\n${chalk.yellow('Internal Link Opportunities:')} ${linkOpps.length}`);

      // Save results
      await fs.mkdir(options.output, { recursive: true });

      await saveOutput(path.join(options.output, 'analysis.json'), analysis);
      await saveOutput(path.join(options.output, 'keywords.json'), clusters);
      await saveOutput(path.join(options.output, 'content-gaps.json'), gaps);
      await saveOutput(path.join(options.output, 'link-opportunities.json'), linkOpps);

      console.log(`\n${chalk.green('✓')} All results saved to ${options.output}/`);

      // Generate content if requested
      if (options.generate && gaps.length > 0) {
        console.log('\n' + chalk.bold('Generating content...'));
        const genSpinner = ora('Creating article...').start();

        const article = await bot.generateArticle({
          targetKeyword: gaps[0],
          tone: 'professional',
        });

        genSpinner.succeed(`Article generated: ${article.title}`);
        await saveArticle(path.join(options.output, `${article.slug}.md`), article);
      }

    } catch (error: any) {
      spinner.fail('Pipeline failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Gaps command
program
  .command('gaps <url>')
  .description('Find content gaps and opportunities')
  .option('-o, --output <file>', 'Output file for results')
  .action(async (url: string, options) => {
    const spinner = ora('Finding content gaps...').start();

    try {
      const bot = new SEOBot();

      spinner.text = 'Analyzing site...';
      const analysis = await bot.analyzeSite(url);

      spinner.text = 'Identifying gaps...';
      const gaps = await bot.findContentGaps(analysis);

      spinner.succeed('Content gap analysis complete!');

      console.log('\n' + chalk.bold('Content Opportunities'));
      console.log(chalk.gray('─'.repeat(50)));

      gaps.forEach((gap: string, i: number) => {
        console.log(`${chalk.yellow(`${i + 1}.`)} ${gap}`);
      });

      if (options.output) {
        await saveOutput(options.output, gaps);
        console.log(`\n${chalk.green('✓')} Results saved to ${options.output}`);
      }
    } catch (error: any) {
      spinner.fail('Gap analysis failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Helper functions
async function saveOutput(filepath: string, data: any) {
  const dir = path.dirname(filepath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filepath, JSON.stringify(data, null, 2));
}

async function saveArticle(filepath: string, article: GeneratedArticle) {
  const dir = path.dirname(filepath);
  await fs.mkdir(dir, { recursive: true });

  const frontMatter = `---
title: "${article.title}"
slug: "${article.slug}"
description: "${article.metaDescription}"
keywords: ["${article.targetKeyword}", ${article.secondaryKeywords.map(k => `"${k}"`).join(', ')}]
wordCount: ${article.wordCount}
readingTime: ${article.readingTime}
generatedAt: "${article.generatedAt.toISOString()}"
---

`;

  await fs.writeFile(filepath, frontMatter + article.content);
}

// Validate configuration before running
const errors = validateConfig();
if (errors.length > 0 && process.argv.length > 2) {
  console.error(chalk.red('Configuration errors:'));
  errors.forEach(e => console.error(`  • ${e}`));
  console.error(chalk.yellow('\nCreate a .env file with your API keys. See .env.example'));
  process.exit(1);
}

program.parse();
