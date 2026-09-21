export type AcademicPeriod = {
  academic_year: string;
  term: string;
};

const STORAGE_KEY = "wtti-swm:academic-period";

function defaultAcademicYear() {
  const year = new Date().getFullYear();
  return `${year}/${year + 1}`;
}

export function getLocalAcademicPeriod(): AcademicPeriod {
  if (typeof window === "undefined") {
    return { academic_year: defaultAcademicYear(), term: "Term 1" };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed?.academic_year === "string" &&
        parsed.academic_year.trim() &&
        typeof parsed?.term === "string" &&
        parsed.term.trim()
      ) {
        return {
          academic_year: parsed.academic_year.trim(),
          term: parsed.term.trim(),
        };
      }
    }
  } catch {
    // Fall back to the current academic year if local storage is unavailable.
  }

  return { academic_year: defaultAcademicYear(), term: "Term 1" };
}

export function saveLocalAcademicPeriod(period: AcademicPeriod): AcademicPeriod {
  const value = {
    academic_year: period.academic_year.trim(),
    term: period.term.trim(),
  };

  if (!value.academic_year || !value.term) {
    throw new Error("Academic year and term are required");
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("wtti-academic-period-changed", { detail: value }));
  }

  return value;
}
