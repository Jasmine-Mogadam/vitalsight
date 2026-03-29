export const COMPENSATION_OPTIONS = [
  {
    value: 'expense_reimbursement',
    label: 'Expense reimbursement',
    shortLabel: 'Expenses',
    help: 'Repays out-of-pocket costs like travel, meals, parking, or lodging.',
  },
  {
    value: 'stipend',
    label: 'Stipend',
    shortLabel: 'Stipend',
    help: 'Pays for time, effort, inconvenience, or missed work.',
  },
  {
    value: 'incentive',
    label: 'Incentive',
    shortLabel: 'Incentive',
    help: 'Uses gift cards, toys, bonuses, or other participation incentives.',
  },
  {
    value: 'none',
    label: 'None',
    shortLabel: 'No compensation',
    help: 'No compensation is offered for this trial.',
  },
];

export const PAYMENT_STRUCTURE_OPTIONS = [
  {
    value: 'lump_sum',
    label: 'Lump-sum',
    shortLabel: 'Lump-sum',
    help: 'Pays once after the participant completes the full study.',
  },
  {
    value: 'milestone',
    label: 'Milestone / per-visit',
    shortLabel: 'Milestone',
    help: 'Pays after each visit, procedure, or completed milestone.',
  },
];

export function getCompensationLabel(value, useShortLabel = false) {
  const option = COMPENSATION_OPTIONS.find((item) => item.value === value);
  return option ? (useShortLabel ? option.shortLabel : option.label) : 'No compensation';
}

export function getPaymentStructureLabel(value, useShortLabel = false) {
  const option = PAYMENT_STRUCTURE_OPTIONS.find((item) => item.value === value);
  return option ? (useShortLabel ? option.shortLabel : option.label) : null;
}

export function getTrialCompensationTags(trial = {}) {
  const compensationType = trial.compensation_type || 'none';
  const tags = [getCompensationLabel(compensationType, true)];
  if (compensationType !== 'none' && trial.payment_structure) {
    tags.push(getPaymentStructureLabel(trial.payment_structure, true));
  }
  return tags.filter(Boolean);
}

export function getTrialSearchPreview(trial = {}) {
  const type = trial.type?.trim() || 'General';
  const compensationType = trial.compensation_type || 'none';
  const paymentStructure = compensationType !== 'none' ? trial.payment_structure : null;

  return {
    type,
    compensationLine: compensationType === 'none'
      ? 'Compensation: No compensation'
      : `Compensation: ${getCompensationLabel(compensationType)}${paymentStructure ? ` • ${getPaymentStructureLabel(paymentStructure)}` : ''}`,
    tags: getTrialCompensationTags(trial),
  };
}

export function formatTrialDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getTrialTimingSummary(trial = {}) {
  const startDate = formatTrialDate(trial.start_date);
  const applicationsCloseAt = formatTrialDate(trial.applications_close_at);
  const lines = [];

  if (startDate) {
    lines.push(`Starts: ${startDate}`);
  }
  if (applicationsCloseAt) {
    lines.push(`Applications close: ${applicationsCloseAt}`);
  } else {
    lines.push('Applications: Ongoing');
  }

  return lines;
}
