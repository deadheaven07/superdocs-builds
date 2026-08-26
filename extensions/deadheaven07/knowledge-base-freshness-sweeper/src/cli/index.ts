import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeBaseSweeper } from '../core/engine.js';
import { Article, ChangeEvent, GroundTruthEntry } from '../core/types.js';
import { formatMetricsTable, formatProposalDiff, colors } from './formatters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadFixtures() {
  const fixturesDir = path.resolve(__dirname, '../../fixtures/corpus');
  const articles: Article[] = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'articles.json'), 'utf-8'));
  const changes: ChangeEvent[] = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'changes.json'), 'utf-8'));
  const groundTruth: GroundTruthEntry[] = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'ground-truth.json'), 'utf-8'));
  return { articles, changes, groundTruth };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'sweep';
  let sampleSize: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sample' && args[i + 1]) {
      sampleSize = parseInt(args[i + 1], 10);
    }
  }

  return { command, sampleSize };
}

export function runCli() {
  const { command, sampleSize } = parseArgs();
  const { articles, changes, groundTruth } = loadFixtures();

  console.log(`\n${colors.bright}${colors.cyan}SuperDocs — Knowledge-base Freshness Sweeper v1.0.0${colors.reset}`);
  console.log(`${colors.dim}Loaded ${articles.length} articles and ${changes.length} product change events.${colors.reset}\n`);

  if (command === 'evaluate') {
    console.log(`${colors.bright}Running Deterministic Seeded Benchmark (${articles.length} articles)...${colors.reset}`);
    const sweeper = new KnowledgeBaseSweeper(articles, changes);
    const { screenshotAssessments } = sweeper.sweep({ provider: 'deterministic' });
    const metrics = sweeper.getMetrics(groundTruth);

    console.log(formatMetricsTable(metrics));

    const staleScreenshots = screenshotAssessments.filter(s => s.replacement_required);
    if (staleScreenshots.length > 0) {
      console.log(`${colors.yellow}⚠️  Detected ${staleScreenshots.length} stale screenshot(s) requiring replacement:${colors.reset}`);
      for (const ss of staleScreenshots) {
        console.log(`  - [Article ${ss.article_id}] Screenshot ${ss.screenshot_id}: ${ss.reason}`);
      }
    }
    return;
  }

  if (command === 'sweep') {
    const sweepCount = sampleSize ? Math.min(sampleSize, articles.length) : articles.length;
    console.log(`${colors.bright}Executing Freshness Sweep (${sampleSize ? `Small-Sample Mode: ${sweepCount} articles` : `Full Corpus: ${sweepCount} articles`})...${colors.reset}`);

    const sweeper = new KnowledgeBaseSweeper(articles, changes);
    const { assessments, proposals, metrics } = sweeper.sweep({
      sample_size: sampleSize,
      provider: 'deterministic'
    });

    console.log(formatMetricsTable(metrics));

    if (proposals.length > 0) {
      console.log(`\n${colors.bright}Generated ${proposals.length} surgical edit proposal(s):${colors.reset}`);
      for (const prop of proposals.slice(0, 2)) {
        console.log(formatProposalDiff(prop));
      }
      if (proposals.length > 2) {
        console.log(`${colors.dim}... and ${proposals.length - 2} more proposal(s) available in the review queue.${colors.reset}`);
      }
    }

    const cna = assessments.filter(a => a.status === 'COULD_NOT_ASSESS');
    if (cna.length > 0) {
      console.log(`\n${colors.yellow}📋 Honest Could-Not-Assess Disclosures (${cna.length} articles):${colors.reset}`);
      for (const item of cna) {
        console.log(`  - [${item.article_id}]: ${item.reason}`);
        if (item.could_not_assess_details) {
          console.log(`    ↳ Missing evidence: ${colors.dim}${item.could_not_assess_details.missing_evidence}${colors.reset}`);
        }
      }
    }
    return;
  }

  console.log(`Unknown command: ${command}. Use 'sweep' or 'evaluate'.`);
}

if (process.argv[1] && (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'))) {
  runCli();
}
