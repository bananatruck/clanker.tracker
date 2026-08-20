/** Expand repeatable application sections before resolving their fields. */
import type { ResumeProfile } from '@/types/profile';
import { findApplicationForm, harvestForm } from './harvest';
import type { SemanticSection } from './types';

type RepeatableSection = Extract<SemanticSection, 'experience' | 'education' | 'project'>;

const LABELS: Record<RepeatableSection, RegExp> = {
  experience: /\badd\s+(another\s+)?(work\s+)?(experience|employment|job)\b/i,
  education: /\badd\s+(another\s+)?(education|school|degree)\b/i,
  project: /\badd\s+(another\s+)?project\b/i,
};

const visible = (element: HTMLElement): boolean => {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return !style || (style.display !== 'none' && style.visibility !== 'hidden');
};

/** Include controls rendered inside the open shadow roots used by modern ATSs. */
function rootsOf(doc: Document): ParentNode[] {
  const roots: ParentNode[] = [doc];
  for (let index = 0; index < roots.length; index++) {
    for (const element of roots[index]!.querySelectorAll<HTMLElement>('*')) {
      if (element.shadowRoot && !roots.includes(element.shadowRoot)) roots.push(element.shadowRoot);
    }
  }
  return roots;
}

export function findAddControl(doc: Document, section: RepeatableSection): HTMLElement | null {
  for (const root of rootsOf(doc)) {
    const candidates = root.querySelectorAll<HTMLElement>(
      'button, [role="button"], input[type="button"], input[type="submit"]',
    );
    for (const candidate of candidates) {
      if (
        !visible(candidate) ||
        candidate.getAttribute('aria-disabled') === 'true' ||
        candidate.hasAttribute('disabled')
      ) continue;

      const text = [
        candidate.textContent,
        candidate.getAttribute('aria-label'),
        candidate.getAttribute('data-automation-id'),
        candidate.getAttribute('value'),
      ].filter(Boolean).join(' ');
      if (LABELS[section].test(text)) return candidate;
    }
  }
  return null;
}

function countRecords(
  fields: ReturnType<typeof harvestForm>['fields'],
  section: RepeatableSection,
): number {
  return new Set(
    fields
      .filter((field) => field.section === section && field.groupIndex !== undefined)
      .map((field) => field.groupIndex),
  ).size;
}

/** Wait only for a real DOM expansion; a dead control is never clicked again. */
function waitForGrowth(
  doc: Document,
  section: RepeatableSection,
  beforeRecords: number,
  beforeFields: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let checkTimer: ReturnType<typeof setTimeout> | undefined;
    const observers: MutationObserver[] = [];

    const finish = (grew: boolean) => {
      if (settled) return;
      settled = true;
      for (const observer of observers) observer.disconnect();
      clearTimeout(timeout);
      if (checkTimer) clearTimeout(checkTimer);
      resolve(grew);
    };
    const check = () => {
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = setTimeout(() => {
        const fields = harvestForm(findApplicationForm(doc)).fields;
        const grew = countRecords(fields, section) > beforeRecords || fields.length > beforeFields;
        if (grew) finish(true);
      }, 20);
    };
    for (const root of rootsOf(doc)) {
      const observer = new MutationObserver(check);
      observer.observe(root instanceof Document ? root.documentElement : root, {
        childList: true,
        subtree: true,
      });
      observers.push(observer);
    }
    const timeout = setTimeout(() => finish(false), 800);
    check();
  });
}

export interface RepeaterReport {
  clicked: number;
  sections: Partial<Record<RepeatableSection, number>>;
}

/**
 * Expose one editable card per structured profile record. Existing cards are
 * never removed, the maximum is bounded, and a control that produces no DOM
 * growth stops immediately instead of being hammered.
 */
export async function prepareRepeaters(
  doc: Document,
  profile: ResumeProfile,
): Promise<RepeaterReport> {
  const wanted: Record<RepeatableSection, number> = {
    experience: Math.min(profile.experience.length, 10),
    education: Math.min(profile.education.length, 10),
    project: Math.min(profile.projects.length, 10),
  };
  const report: RepeaterReport = { clicked: 0, sections: {} };

  for (const section of Object.keys(wanted) as RepeatableSection[]) {
    let fields = harvestForm(findApplicationForm(doc)).fields;
    let existing = countRecords(fields, section);
    let clicks = 0;

    while (existing < wanted[section] && clicks < wanted[section]) {
      const control = findAddControl(doc, section);
      if (!control) break;
      const beforeFields = fields.length;
      control.click();
      clicks++;
      report.clicked++;
      if (!await waitForGrowth(doc, section, existing, beforeFields)) break;
      fields = harvestForm(findApplicationForm(doc)).fields;
      existing = countRecords(fields, section);
    }

    if (clicks > 0) report.sections[section] = clicks;
  }

  return report;
}
