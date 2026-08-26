import { PortfolioMetrics, EditProposal } from '../core/types.js';

export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m'
};

export function formatMetricsTable(metrics: PortfolioMetrics): string {
  const lines: string[] = [];
  lines.push(`${colors.bright}${colors.cyan}┌────────────────────────────────────────────────────────────┐${colors.reset}`);
  lines.push(`${colors.bright}${colors.cyan}│      KNOWLEDGE-BASE FRESHNESS SWEEPER — PORTFOLIO METRICS  │${colors.reset}`);
  lines.push(`${colors.bright}${colors.cyan}├────────────────────────────────────────────────────────────┤${colors.reset}`);
  lines.push(`│ Total Scanned Articles:     ${colors.bright}${metrics.total_articles.toString().padEnd(28)}${colors.reset}│`);
  lines.push(`│ Healthy (Unchanged):        ${colors.green}${metrics.unchanged_articles.toString().padEnd(28)}${colors.reset}│`);
  lines.push(`│ Stale / Affected Articles:  ${colors.red}${metrics.affected_articles.toString().padEnd(28)}${colors.reset}│`);
  lines.push(`│ Could-Not-Assess (Honest):  ${colors.yellow}${metrics.could_not_assess.toString().padEnd(28)}${colors.reset}│`);
  lines.push(`${colors.bright}${colors.cyan}├────────────────────────────────────────────────────────────┤${colors.reset}`);
  lines.push(`│ Portfolio Freshness Score:  ${colors.bright}${colors.green}${(metrics.freshness_score + '%').padEnd(28)}${colors.reset}│`);
  lines.push(`│ Assessment Coverage:        ${colors.bright}${(metrics.assessment_coverage + '%').padEnd(28)}${colors.reset}│`);
  lines.push(`│ Could-Not-Assess Rate:      ${colors.yellow}${(metrics.could_not_assess_rate + '%').padEnd(28)}${colors.reset}│`);
  lines.push(`${colors.bright}${colors.cyan}├────────────────────────────────────────────────────────────┤${colors.reset}`);
  lines.push(`│ Evaluation Precision:       ${colors.bright}${((metrics.precision * 100).toFixed(1) + '%').padEnd(28)}${colors.reset}│`);
  lines.push(`│ Evaluation Recall:          ${colors.bright}${((metrics.recall * 100).toFixed(1) + '%').padEnd(28)}${colors.reset}│`);
  lines.push(`│ Evaluation F1 Score:        ${colors.bright}${metrics.f1_score.toString().padEnd(28)}${colors.reset}│`);
  lines.push(`│ True Positives / Negatives: ${colors.green}${metrics.true_positives}${colors.reset} TP / ${colors.green}${metrics.true_negatives}${colors.reset} TN`.padEnd(52) + '│');
  lines.push(`│ False Positives / Negatives:${colors.red}${metrics.false_positives}${colors.reset} FP / ${colors.red}${metrics.false_negatives}${colors.reset} FN`.padEnd(52) + '│');
  lines.push(`${colors.bright}${colors.cyan}├────────────────────────────────────────────────────────────┤${colors.reset}`);
  lines.push(`│ Configured Budget Cap:      ${('$ ' + metrics.budget_limit.toFixed(2)).padEnd(28)}│`);
  lines.push(`│ Actual Model / API Spend:   ${colors.green}${('$ ' + metrics.actual_cost.toFixed(2)).padEnd(28)}${colors.reset}│`);
  lines.push(`${colors.bright}${colors.cyan}└────────────────────────────────────────────────────────────┘${colors.reset}`);
  return lines.join('\n');
}

export function formatProposalDiff(proposal: EditProposal): string {
  const lines: string[] = [];
  lines.push(`\n${colors.bright}${colors.yellow}================ PROPOSED SURGICAL EDIT ================${colors.reset}`);
  lines.push(`Article ID:   ${colors.bright}${proposal.article_id}${colors.reset}`);
  lines.push(`Change ID:    ${proposal.change_id}`);
  lines.push(`Confidence:   ${proposal.confidence === 'HIGH' ? colors.green + 'HIGH' : colors.yellow + 'MEDIUM'}${colors.reset}`);
  lines.push(`Preservation: ${colors.green}${(proposal.structural_preservation_ratio * 100).toFixed(1)}%${colors.reset} of article content preserved unmodified`);
  lines.push(`Rationale:    ${proposal.rationale}\n`);

  lines.push(`${colors.bright}--- Evidence Quotes ---${colors.reset}`);
  for (const e of proposal.evidence) {
    lines.push(`  [Sentence ${e.sentence_index}] ${colors.dim}"${e.sentence_text}"${colors.reset}`);
    lines.push(`  ↳ ${e.explanation}`);
  }

  lines.push(`\n${colors.bright}--- Surgical Diff Spans ---${colors.reset}`);
  for (const span of proposal.changed_spans) {
    lines.push(`${colors.red}- ${span.original_text}${colors.reset}`);
    lines.push(`${colors.green}+ ${span.replacement_text}${colors.reset}`);
  }
  lines.push(`${colors.bright}${colors.yellow}========================================================${colors.reset}\n`);

  return lines.join('\n');
}
