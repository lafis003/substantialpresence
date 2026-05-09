// ─── State ───────────────────────────────────────────────────────────────────
const _now = new Date();
const _thisYear = _now.getFullYear();

const state = {
  history: [],
  currentStep: 'welcome',
  taxYear: _thisYear - 1,          // default: last tax year
  isCurrentYear: false,            // true when user picks "right now"
  currentDayOfYear: 0,             // days elapsed so far this year (only relevant when isCurrentYear)
  hadPartialExempt: false,
  spt: {
    days0: 0,   // current year
    days1: 0,   // prior year
    days2: 0,   // year before prior
    mode0: 'direct',
    mode1: 'direct',
    mode2: 'direct',
    absence0: 0,
    absence1: 0,
    absence2: 0,
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMaxDays(yearOffset) {
  // For "right now" mode, year 0 is capped at how many days have elapsed this year
  if (yearOffset === 0 && state.isCurrentYear) return state.currentDayOfYear;
  const y = state.taxYear - yearOffset;
  return (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 366 : 365;
}

// Compute day-of-year for today (1 = Jan 1)
function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d - start) / 86400000) + 1;
}

// Format a date as "May 9, 2025"
function formatDate(d) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Called by year-select buttons — sets year, resets SPT inputs, navigates
function setYearAndGo(year, isCurrent, stepId) {
  state.taxYear = year;
  state.isCurrentYear = isCurrent;
  state.currentDayOfYear = isCurrent ? dayOfYear(_now) : 0;
  // Reset SPT inputs whenever the year changes
  state.spt = {
    days0: 0, days1: 0, days2: 0,
    mode0: 'direct', mode1: 'direct', mode2: 'direct',
    absence0: 0, absence1: 0, absence2: 0,
  };
  goTo(stepId);
}

function back() {
  if (state.history.length === 0) return '';
  return `<button class="back-btn" onclick="goBack()">← Back</button>`;
}

function choice(icon, title, desc, target, extraOnClick) {
  const click = extraOnClick
    ? `${extraOnClick}; goTo('${target}')`
    : `goTo('${target}')`;
  return `
    <button class="choice-btn" onclick="${click}">
      <span class="icon">${icon}</span>
      <span class="btn-text">
        <span class="btn-title">${title}</span>
        ${desc ? `<span class="btn-desc">${desc}</span>` : ''}
      </span>
    </button>
  `;
}

function restart() {
  return `<button class="restart-btn" onclick="goTo('welcome')">Start Over</button>`;
}

// ─── SPT calculation ──────────────────────────────────────────────────────────
function effectiveDays(offset) {
  const s = state.spt;
  const maxD = getMaxDays(offset);
  if (s[`mode${offset}`] === 'absence') {
    return Math.max(0, maxD - s[`absence${offset}`]);
  }
  return Math.min(s[`days${offset}`], maxD);
}

function buildSPTResultHTML() {
  const d0 = effectiveDays(0), d1 = effectiveDays(1), d2 = effectiveDays(2);

  const y = state.taxYear;
  const w0 = d0, w1 = Math.floor(d1 / 3), w2 = Math.floor(d2 / 6);
  const weighted = w0 + w1 + w2;
  const passes31 = d0 >= 31;
  const passesTotal = weighted >= 183;
  const meetsSPT = passes31 && passesTotal;

  const cls = meetsSPT ? 'pass' : 'fail';
  const verdict = meetsSPT
    ? `You <strong>meet</strong> the Substantial Presence Test → proceed to check for exceptions`
    : `You do <strong>not</strong> meet the Substantial Presence Test → you are likely a non-resident alien`;

  return `
    <div class="spt-result-box ${cls}">
      <div class="spt-formula">
        <span>${d0}</span>&thinsp;×&thinsp;1 + <span>${d1}</span>&thinsp;×&thinsp;⅓ + <span>${d2}</span>&thinsp;×&thinsp;⅙ &nbsp;=&nbsp; <span>${w0} + ${w1} + ${w2}</span>
      </div>
      <div class="spt-total">${weighted} weighted days ${meetsSPT ? '≥ 183 ✓' : '< 183'}</div>
      ${!passes31 ? `<div class="spt-verdict" style="color:var(--amber)">Also: fewer than 31 days in ${y} → test not met regardless of total</div>` : ''}
      <div class="spt-verdict">${verdict}</div>
    </div>
    <button class="spt-continue-btn" onclick="goTo('${meetsSPT ? 'after_spt_pass' : 'after_spt_fail'}')">
      Continue →
    </button>
  `;
}

// Targeted update — called by slider / input events to avoid re-rendering the whole step
function updateSPTDisplay() {
  for (let i = 0; i < 3; i++) {
    if (state.spt[`mode${i}`] === 'absence') {
      const absence = state.spt[`absence${i}`];
      const effective = Math.max(0, getMaxDays(i) - absence);

      const valEl   = document.getElementById(`absence-val-${i}`);
      const daysEl  = document.getElementById(`total-days-${i}`);
      const sliderEl = document.getElementById(`absence-slider-${i}`);

      if (valEl)    valEl.textContent    = absence;
      if (daysEl)   daysEl.textContent   = `Days in US: ${effective}`;
      if (sliderEl) sliderEl.value       = absence;
    }
  }
  const resultArea = document.getElementById('spt-result-area');
  if (resultArea) resultArea.innerHTML = buildSPTResultHTML();
}

// ─── SPT mutators ─────────────────────────────────────────────────────────────
function setSPTMode(offset, mode) {
  state.spt[`mode${offset}`] = mode;
  render();   // mode toggle is a click — full re-render is fine
}

function setSPTDays(offset, value) {
  const v = parseInt(value, 10);
  state.spt[`days${offset}`] = isNaN(v) ? 0 : Math.max(0, Math.min(v, getMaxDays(offset)));
  updateSPTDisplay();  // targeted — keeps input focus
}

function setSPTAbsence(offset, value) {
  const v = parseInt(value, 10);
  state.spt[`absence${offset}`] = isNaN(v) ? 0 : Math.max(0, Math.min(v, getMaxDays(offset)));
  updateSPTDisplay();  // targeted — keeps slider draggable
}

function adjustAbsence(offset, delta) {
  state.spt[`absence${offset}`] = Math.max(0, Math.min(
    state.spt[`absence${offset}`] + delta,
    getMaxDays(offset)
  ));
  updateSPTDisplay();
}

// ─── Steps ────────────────────────────────────────────────────────────────────
const steps = {

  // ── Welcome ────────────────────────────────────────────────────────────────
  welcome: () => `
    <div class="welcome-card">
      <div class="logo">🇺🇸</div>
      <h1>US Tax Residency Check</h1>
      <p>Answer a few simple questions to find out whether you're considered a
         <strong>US resident for tax purposes or other legal matters</strong> — and whether you
         need to file as a resident or non-resident alien.</p>
      <div class="welcome-tags">
        <span class="tag green">Free &amp; Private</span>
        <span class="tag blue">Substantial Presence Test</span>
        <span class="tag blue">Exemptions Covered</span>
        <span class="tag amber">~2 Minutes</span>
      </div>
      <button class="start-btn" onclick="goTo('year_select')">Get Started →</button>
    </div>
  `,

  // ── Year selection ─────────────────────────────────────────────────────────
  year_select: () => {
    const thisYear  = _thisYear;
    const lastYear  = thisYear - 1;
    const twoAgo    = thisYear - 2;
    const doy       = dayOfYear(_now);
    const todayStr  = _now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return `
      <div class="card">
        ${back()}
        <div class="label">Step 1 of 6 · Period</div>
        <h1>Which period do you want to check?</h1>
        <p class="subtitle">The Substantial Presence Test spans three calendar years. Pick the year you want to treat as the <em>current</em> year for the calculation.</p>
        <div class="choices">
          <button class="choice-btn" onclick="setYearAndGo(${lastYear}, false, 'green_card')">
            <span class="icon">📋</span>
            <span class="btn-text">
              <span class="btn-title">Last tax year &nbsp;<span class="year-chip">${lastYear}</span></span>
              <span class="btn-desc">For filing your ${lastYear} return — uses ${lastYear}, ${lastYear - 1}, and ${lastYear - 2}</span>
            </span>
          </button>
          <button class="choice-btn" onclick="setYearAndGo(${twoAgo}, false, 'green_card')">
            <span class="icon">📂</span>
            <span class="btn-text">
              <span class="btn-title">Two years ago &nbsp;<span class="year-chip">${twoAgo}</span></span>
              <span class="btn-desc">For an amended return or checking a prior year — uses ${twoAgo}, ${twoAgo - 1}, and ${twoAgo - 2}</span>
            </span>
          </button>
          <button class="choice-btn" onclick="setYearAndGo(${thisYear}, true, 'green_card')">
            <span class="icon">📍</span>
            <span class="btn-text">
              <span class="btn-title">Right now &nbsp;<span class="year-chip">${thisYear}, through ${todayStr}</span></span>
              <span class="btn-desc">Check whether you already meet the test today — year ${thisYear} capped at ${doy} days elapsed, plus full-year counts for ${lastYear} and ${twoAgo}</span>
            </span>
          </button>
        </div>
      </div>
    `;
  },

  // ── Green card ─────────────────────────────────────────────────────────────
  green_card: () => `
    <div class="card">
      ${back()}
      <div class="label">Step 1 of 6 · Green Card</div>
      <h1>Do you hold a US Green Card (Permanent Resident Card)?</h1>
      <p class="subtitle">This is Form I-551, also called a Lawful Permanent Resident card. Even if it
         hasn't been activated or you haven't used it recently, holding it makes you a US tax resident.</p>
      <div class="choices">
        ${choice('✅','Yes','I currently hold a valid green card','green_card_yes')}
        ${choice('❌','No','I do not hold a green card','visa_type')}
      </div>
    </div>
  `,

  green_card_yes: () => `
    <div class="result-card resident">
      ${back()}
      <div class="result-icon">✅</div>
      <h1>You are a US Tax Resident</h1>
      <p>As a Green Card holder, you are treated as a <strong>lawful permanent resident</strong> and are
         considered a US resident for tax purposes for the entire year — regardless of how many days
         you actually spent in the US.</p>
      <p>This means you must:</p>
      <ul>
        <li>File Form <strong>1040</strong> (not 1040-NR)</li>
        <li>Report your <strong>worldwide income</strong>, not just US-source income</li>
        <li>This applies even if you lived abroad most of the year</li>
      </ul>
      <div class="note">
        ℹ️ Your green card residency status ends only if you formally abandon it in writing to USCIS,
        or if it is administratively or judicially terminated.
        A tax treaty may allow you to be treated as a non-resident, but this has complex implications —
        consult a tax professional.
      </div>
      ${restart()}
    </div>
  `,

  // ── Visa type ──────────────────────────────────────────────────────────────
  visa_type: () => `
    <div class="card">
      ${back()}
      <div class="label">Step 2 of 6 · Visa &amp; Status</div>
      <h1>What is your current US immigration status?</h1>
      <p class="subtitle">Select the option that best describes your <em>primary</em> status during the
         tax year being reviewed. If you changed status mid-year, pick the most recent one.</p>
      <div class="choices">
        ${choice('🎓','F-1 or F-2 Visa','Student or dependent of student','exempt_f')}
        ${choice('🔬','J-1 or J-2 Visa','Exchange visitor (student, teacher, researcher, trainee) or dependent','exempt_j')}
        ${choice('📚','M-1 or M-2 Visa','Vocational/non-academic student or dependent','exempt_m')}
        ${choice('🌐','Q-1 Visa','International cultural exchange','exempt_q')}
        ${choice('🏛️','A or G Visa','Diplomat, government official, or international org employee','exempt_ag')}
        ${choice('💼','H-1B, L-1, O-1, TN, E-3…','Work visa or other non-immigrant visa','partial_exempt_check')}
        ${choice('📋','B-1 / B-2','Business visitor or tourist','partial_exempt_check')}
        ${choice('⏳','Pending / No Status','No current valid status, DACA, parole, or other','partial_exempt_check')}
        ${choice('❓','Other / Not Sure','I\'m unsure or my visa isn\'t listed','partial_exempt_check')}
      </div>
    </div>
  `,

  // ── Partial exempt check (for non-exempt visa holders) ────────────────────
  partial_exempt_check: () => {
    const y0 = state.taxYear, y1 = y0 - 1, y2 = y0 - 2;
    return `
      <div class="card">
        ${back()}
        <div class="label">Step 3 of 6 · Mixed Status Check</div>
        <h1>In any of the three years covered by this calculation (${y2}–${y0}), were you present in the US in an exempt visa status?</h1>
        <p class="subtitle">Exempt statuses include: <strong>F-1/F-2</strong> (student),
           <strong>J-1/J-2</strong> (exchange visitor), <strong>M-1/M-2</strong> (vocational student),
           <strong>Q-1</strong> (cultural exchange), or <strong>A/G</strong> (diplomatic).</p>
        <p class="subtitle">This matters because days spent in exempt status
           <strong>do not count</strong> toward the Substantial Presence Test — even if they were in a different year.
           For example: you were on F-1 throughout ${y2} and ${y1}, then switched to H-1B in ${y0}.</p>
        <div class="choices">
          ${choice('✅','Yes — in at least one of those years',
            `e.g., on F-1 in ${y2} or ${y1}, or switched to H-1B mid-${y0}`,
            'partial_exempt_info', `state.hadPartialExempt = true`)}
          ${choice('❌','No — I was on a non-exempt visa for all three years',
            `H-1B, L-1, B-1/B-2, etc. throughout ${y2}, ${y1}, and ${y0}`,
            'check_spt_needed', `state.hadPartialExempt = false`)}
        </div>
      </div>
    `;
  },

  // ── Partial exempt explanation ─────────────────────────────────────────────
  partial_exempt_info: () => {
    const y0 = state.taxYear, y1 = y0 - 1, y2 = y0 - 2;
    return `
      <div class="card">
        ${back()}
        <div class="label">Important: Only Count Non-Exempt Days</div>
        <h1>For each year, enter only the days you were <em>not</em> in exempt status</h1>
        <p class="subtitle">Days spent in the US while on an exempt visa (F-1, J-1, M-1, etc.) are
           <strong>excluded</strong> from the Substantial Presence Test —
           <em>as long as your exemption was still valid during those days</em>
           (e.g., within the 5-year student limit). This applies to all three years you'll enter.</p>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:18px 22px;margin-bottom:24px;font-size:0.9rem;line-height:2;">
          <div style="margin-bottom:6px;font-weight:600;color:var(--text)">Example</div>
          <div><span style="color:var(--text-muted)">${y2} — all year on F-1:</span> &nbsp;<span style="color:var(--amber)">0 days count</span></div>
          <div><span style="color:var(--text-muted)">${y1} — all year on F-1:</span> &nbsp;<span style="color:var(--amber)">0 days count</span></div>
          <div><span style="color:var(--text-muted)">${y0} — F-1 Jan–Jul (196 days), then H-1B Aug–Dec (153 days):</span></div>
          <div style="padding-left:16px;"><span style="color:var(--amber)">196 days do NOT count</span> &nbsp;·&nbsp; <span style="color:var(--green)">153 days count</span></div>
          <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px;">
            Enter <strong>0</strong> for ${y2}, <strong>0</strong> for ${y1}, <strong>153</strong> for ${y0}.
          </div>
        </div>
        <div class="note" style="margin-bottom:24px;">
          ⚠️ <strong>If your F-1 exemption had already expired</strong> in a given year (i.e., you were
          in your 6th or later calendar year of F-1 presence), those days <em>do</em> count — enter them normally.
        </div>
        <div class="choices">
          ${choice('📊','Got it — continue to the calculator','','check_spt_needed')}
        </div>
      </div>
    `;
  },

  // ── F visa ─────────────────────────────────────────────────────────────────
  exempt_f: () => `
    <div class="card">
      ${back()}
      <div class="label">Step 3 of 6 · F Visa Exemption</div>
      <h1>How many calendar years have you been in the US on an F-1 or F-2 visa?</h1>
      <p class="subtitle">F-1/F-2 visa holders are "exempt individuals" — days spent in the US generally
         <em>do not count</em> toward the Substantial Presence Test for up to 5 calendar years (lifetime).
         A partial year counts as a full year. Count only years when you were physically present in the US.</p>
      <div class="choices">
        ${choice('1️⃣','1–4 calendar years','Still within the 5-year exemption window','f_still_exempt')}
        ${choice('5️⃣','Exactly 5 calendar years','Used up all 5 exempt years','f_check_spt')}
        ${choice('6️⃣','6 or more calendar years','Exemption has expired — must count all days','f_check_spt')}
        ${choice('❓','Not sure','Help me count','f_count_help')}
      </div>
    </div>
  `,

  f_still_exempt: () => `
    <div class="result-card nonresident">
      ${back()}
      <div class="result-icon">📋</div>
      <h1>You Are Likely a Non-Resident Alien</h1>
      <p>As an F-1 visa holder within your first 5 calendar years in the US, your days of presence
         generally <strong>do not count</strong> toward the Substantial Presence Test.</p>
      <p>This typically means you are a <strong>non-resident alien</strong> for tax purposes.</p>
      <p>Key obligations:</p>
      <ul>
        <li>File <strong>Form 8843</strong> (Statement for Exempt Individuals) — required even with zero US income</li>
        <li>If you have US-source income, also file <strong>Form 1040-NR</strong></li>
        <li>Report only US-source income (not worldwide income)</li>
        <li>Form 8843 deadline: April 15; mail to IRS — no online filing option</li>
      </ul>
      <div class="note">
        ⚠️ You must "substantially comply" with your F-1 visa requirements to use the exemption.
        If you violated your visa status, days may still count. Consult a tax professional if unsure.
      </div>
      ${restart()}
    </div>
  `,

  f_count_help: () => {
    const cutoff = state.taxYear - 4;
    const safe   = state.taxYear - 3;
    return `
      <div class="card">
        ${back()}
        <div class="label">Counting Exempt Years</div>
        <h1>How to count your exempt F-1 years</h1>
        <p class="subtitle">Count the number of calendar years in which you were physically present in the US
           in F-1 or F-2 status. Any partial year (even one day) counts as a full year.
           Years do not need to be consecutive.</p>
        <div class="choices">
          ${choice('📅',`I first arrived before ${cutoff}`,'5 or more exempt years used','f_check_spt')}
          ${choice('📅',`I first arrived in ${safe} or later`,'4 or fewer exempt years','f_still_exempt')}
        </div>
      </div>
    `;
  },

  f_check_spt: () => `
    <div class="card">
      ${back()}
      <div class="label">Exemption Expired</div>
      <h1>Your F-1 exemption has been used up</h1>
      <p class="subtitle">You've been in the US in F-1/F-2 status for 5 or more calendar years.
         Your days of presence <em>now count</em> toward the Substantial Presence Test,
         just like any other visa holder. You must count all days in the US.</p>
      <div class="choices">
        ${choice('📊','Continue to Substantial Presence Test','','spt_intro')}
      </div>
    </div>
  `,

  // ── J visa ─────────────────────────────────────────────────────────────────
  exempt_j: () => `
    <div class="card">
      ${back()}
      <div class="label">Step 3 of 6 · J Visa Exemption</div>
      <h1>What is your J-1 visa category?</h1>
      <p class="subtitle">The exemption period differs depending on your J-1 program type.</p>
      <div class="choices">
        ${choice('🎓','Student','Degree-seeking or non-degree student program','exempt_j_student')}
        ${choice('👩‍🏫','Teacher or Professor','Teaching at an educational institution','exempt_j_teacher')}
        ${choice('🔬','Researcher or Scholar','Research at a university, hospital, or similar institution','exempt_j_teacher')}
        ${choice('🛠️','Trainee or Intern','On-the-job training program','exempt_j_teacher')}
        ${choice('❓','Other / Not Sure','Au pair, camp counselor, work-travel, etc.','exempt_j_other')}
      </div>
    </div>
  `,

  exempt_j_student: () => `
    <div class="card">
      ${back()}
      <div class="label">J-1 Student Exemption</div>
      <h1>How many calendar years have you been in the US on a J-1 or J-2 student visa?</h1>
      <p class="subtitle">J-1 students get the same 5-year lifetime exemption as F-1 students.
         Any partial calendar year counts as a full year.</p>
      <div class="choices">
        ${choice('1️⃣','1–4 calendar years','Still within the 5-year exemption window','f_still_exempt')}
        ${choice('5️⃣','5 or more calendar years','Exemption expired — must count all days','f_check_spt')}
      </div>
    </div>
  `,

  exempt_j_teacher: () => `
    <div class="card">
      ${back()}
      <div class="label">J-1 Teacher/Researcher Exemption</div>
      <h1>Have you already used 2 or more exempt calendar years as a J-1 teacher, researcher, or trainee in the past 6 years?</h1>
      <p class="subtitle">J-1 teachers, researchers, and trainees may be exempt for up to 2 calendar years
         in any 6-year period. This resets over time (unlike the student exemption which is a lifetime cap).</p>
      <div class="choices">
        ${choice('✅','No — fewer than 2 exempt years in the past 6','Still within the exemption window','j_teacher_exempt')}
        ${choice('❌','Yes — already used 2 exempt years in the past 6','Exemption used up — must count days','f_check_spt')}
        ${choice('❓','Not sure','I need to check','j_teacher_help')}
      </div>
    </div>
  `,

  j_teacher_exempt: () => `
    <div class="result-card nonresident">
      ${back()}
      <div class="result-icon">📋</div>
      <h1>You Are Likely a Non-Resident Alien</h1>
      <p>As a J-1 teacher, researcher, or trainee within your 2-year exemption window, your days of presence
         generally <strong>do not count</strong> toward the Substantial Presence Test.</p>
      <ul>
        <li>File <strong>Form 8843</strong> — required even with zero US income</li>
        <li>If you have US-source income, also file <strong>Form 1040-NR</strong></li>
        <li>Your home country's tax treaty with the US may also provide additional benefits</li>
      </ul>
      <div class="note">
        ⚠️ Must "substantially comply" with J-1 visa requirements. Consult a tax professional
        if you are unsure whether your specific program qualifies.
      </div>
      ${restart()}
    </div>
  `,

  j_teacher_help: () => {
    const from = state.taxYear - 5;
    const to   = state.taxYear;
    return `
      <div class="card">
        ${back()}
        <div class="label">Counting J-1 Exempt Years</div>
        <h1>Count your J-1 exempt years in the past 6 years</h1>
        <p class="subtitle">Look at the 6 calendar years from ${from} through ${to}.
           Count how many years you were present in the US in J-1 status as a teacher, researcher, or trainee
           (not as a student — those count separately under the 5-year rule).</p>
        <div class="choices">
          ${choice('1️⃣','0 or 1 year','Still within the 2-year limit','j_teacher_exempt')}
          ${choice('2️⃣','2 or more years','Exemption used up','f_check_spt')}
        </div>
      </div>
    `;
  },

  exempt_j_other: () => `
    <div class="card">
      ${back()}
      <div class="label">J Visa — Other Category</div>
      <h1>Your specific J-1 category may have a different exemption rule</h1>
      <p class="subtitle">Some J-1 categories (au pair, summer work travel, camp counselor) typically
         fall under the trainee/teacher 2-year rule. However, rules can vary.
         We'll proceed to the Substantial Presence Test to be safe.</p>
      <div class="choices">
        ${choice('📊','Continue to Substantial Presence Test','','spt_intro')}
        ${choice('↩️','Go back and pick a more specific category','','exempt_j')}
      </div>
    </div>
  `,

  // ── M visa ─────────────────────────────────────────────────────────────────
  exempt_m: () => `
    <div class="card">
      ${back()}
      <div class="label">Step 3 of 6 · M Visa Exemption</div>
      <h1>How many calendar years have you been in the US on an M-1 or M-2 visa?</h1>
      <p class="subtitle">M-1/M-2 visa holders are exempt individuals — days do not count toward the
         Substantial Presence Test for up to 5 calendar years (lifetime, same rule as F-1).</p>
      <div class="choices">
        ${choice('1️⃣','1–4 calendar years','Still within the 5-year exemption window','f_still_exempt')}
        ${choice('5️⃣','5 or more calendar years','Exemption expired — must count all days','f_check_spt')}
      </div>
    </div>
  `,

  // ── Q visa ─────────────────────────────────────────────────────────────────
  exempt_q: () => `
    <div class="card">
      ${back()}
      <div class="label">Step 3 of 6 · Q Visa Exemption</div>
      <h1>What is your role on the Q-1 visa?</h1>
      <div class="choices">
        ${choice('🎓','Exchange student or trainee','Up to 5-year exemption','exempt_m')}
        ${choice('👩‍🏫','Faculty, researcher, or similar','Up to 2 years in past 6','exempt_j_teacher')}
      </div>
    </div>
  `,

  // ── A/G visa ───────────────────────────────────────────────────────────────
  exempt_ag: () => `
    <div class="result-card nonresident">
      ${back()}
      <div class="result-icon">🏛️</div>
      <h1>You Are a Non-Resident Alien (Diplomatic Exemption)</h1>
      <p>Holders of <strong>A or G visas</strong> (foreign government officials, diplomats, employees of
         international organizations, and their immediate families) are <em>fully exempt</em> indefinitely —
         no time limit applies.</p>
      <p>Your days in the US never count toward the Substantial Presence Test.</p>
      <ul>
        <li>File <strong>Form 8843</strong> annually (required even with zero US income)</li>
        <li>If you have US-source income subject to US tax, also file <strong>Form 1040-NR</strong></li>
      </ul>
      <div class="note">
        ⚠️ <strong>Exception:</strong> A-3 (personal employee of diplomat) and G-5 (domestic worker of
        international org employee) visa holders are NOT exempt and must count all days.
        If you hold A-3 or G-5, <button class="inline-link" onclick="goTo('check_spt_needed')">click here to continue</button>.
      </div>
      ${restart()}
    </div>
  `,

  // ── 31-day threshold check ─────────────────────────────────────────────────
  check_spt_needed: () => `
    <div class="card">
      ${back()}
      <div class="label">Step 3 of 6 · Days Present</div>
      <h1>Were you present in the US for at least 31 days during ${state.taxYear}?</h1>
      <p class="subtitle">The Substantial Presence Test only applies if you were physically present in
         the US for at least 31 days in the current tax year.
         ${state.hadPartialExempt
           ? `<strong>Count only your non-exempt days</strong> (i.e., the days you were not in F-1, J-1, M-1, Q, or diplomatic status — or after your exemption had expired).`
           : 'Even a partial day counts as a full day.'
         }</p>
      <div class="choices">
        ${choice('✅','Yes — 31 days or more','Need to check Substantial Presence Test','spt_intro')}
        ${choice('❌','No — fewer than 31 days','Automatically not a resident this year','under_31_days')}
      </div>
    </div>
  `,

  under_31_days: () => `
    <div class="result-card nonresident">
      ${back()}
      <div class="result-icon">📋</div>
      <h1>You Are a Non-Resident Alien</h1>
      <p>Because you were present in the US for <strong>fewer than 31 days</strong> in ${state.taxYear},
         you automatically fail the Substantial Presence Test and are a non-resident alien for that year.</p>
      <ul>
        <li>If you had US-source income, file <strong>Form 1040-NR</strong></li>
        <li>You report only US-source income (not worldwide income)</li>
      </ul>
      ${restart()}
    </div>
  `,

  // ── SPT Introduction ───────────────────────────────────────────────────────
  spt_intro: () => `
    <div class="card">
      ${back()}
      <div class="label">Step 4 of 6 · Substantial Presence Test</div>
      <h1>Let's calculate the Substantial Presence Test</h1>
      <p class="subtitle">The test looks at days across <strong>3 years</strong>. To pass (= be a resident),
         you need a weighted total of <strong>183 or more days</strong> using this formula:</p>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:18px 20px;margin-bottom:${state.hadPartialExempt ? '16' : '28'}px;font-family:'SF Mono','Fira Code',monospace;font-size:0.88rem;line-height:2;">
        <div><span style="color:var(--accent);font-weight:700">${state.taxYear}</span> days × 1 (full weight)</div>
        <div><span style="color:var(--accent);font-weight:700">${state.taxYear - 1}</span> days × 1/3</div>
        <div><span style="color:var(--accent);font-weight:700">${state.taxYear - 2}</span> days × 1/6</div>
        <div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px;color:var(--text)">Total ≥ 183 → <strong>Resident Alien</strong></div>
      </div>
      ${state.hadPartialExempt ? `
        <div class="note" style="margin-bottom:24px;">
          📌 Remember: since you were in exempt status (F-1, J-1, etc.) for part of one or more years,
          <strong>enter only the days you were NOT in exempt status</strong> for each year.
          Do not count days while your exemption was still valid.
        </div>
      ` : ''}
      <div class="choices">
        ${choice('📊','Start the calculator','Enter your days for each year','spt_calc')}
      </div>
    </div>
  `,

  // ── SPT Calculator ─────────────────────────────────────────────────────────
  spt_calc: () => {
    const s = state.spt;
    const y = state.taxYear;
    const todayStr = state.isCurrentYear ? formatDate(_now) : null;
    const year0Label = state.isCurrentYear
      ? `${y} — so far this year (through ${todayStr})`
      : `${y} (current tax year)`;

    function yearSection(offset, yearLabel, weight) {
      const mode   = s[`mode${offset}`];
      const direct = s[`days${offset}`];
      const absence = s[`absence${offset}`];
      const maxD   = getMaxDays(offset);
      const effectiveD = mode === 'absence' ? Math.max(0, maxD - absence) : (direct ?? 0);

      const exemptNote = state.hadPartialExempt
        ? `<div style="font-size:0.78rem;color:var(--amber);margin-bottom:10px;">
             Enter only non-exempt days (exclude F-1, J-1, M-1 etc. days while exemption was valid)
           </div>`
        : '';

      return `
        <div class="year-section">
          <div class="year-label">
            <h3>${yearLabel}</h3>
            <span class="weight-badge">weight: ${weight}</span>
          </div>
          ${exemptNote}
          <div class="mode-toggle">
            <button class="mode-btn ${mode === 'direct' ? 'active' : ''}"
              onclick="setSPTMode(${offset},'direct')">Enter days directly</button>
            <button class="mode-btn ${mode === 'absence' ? 'active' : ''}"
              onclick="setSPTMode(${offset},'absence')">I was there every day except…</button>
          </div>
          ${mode === 'direct' ? `
            <div class="direct-input-row">
              <input class="days-input" type="number" min="0" max="${maxD}"
                value="${direct}"
                oninput="setSPTDays(${offset}, this.value)" />
              <span class="days-hint">days (0 – ${maxD})</span>
            </div>
          ` : `
            <div class="absence-wrap">
              <div class="absence-label-row">
                <span>Days absent / excluded: <strong id="absence-val-${offset}">${absence}</strong></span>
                <span class="total-days-display" id="total-days-${offset}">Days in US: ${effectiveD}</span>
              </div>
              <div class="absence-controls">
                <input id="absence-slider-${offset}" class="absence-slider" type="range"
                  min="0" max="${maxD}" value="${absence}"
                  oninput="setSPTAbsence(${offset}, this.value)" />
                <div class="absence-stepper">
                  <button class="step-btn" onclick="adjustAbsence(${offset}, -1)">−</button>
                  <span class="absence-value-display" id="absence-val-${offset}">${absence}</span>
                  <button class="step-btn" onclick="adjustAbsence(${offset}, 1)">+</button>
                </div>
              </div>
            </div>
          `}
        </div>
      `;
    }

    return `
      <div class="spt-card">
        ${back()}
        <div class="label">Step 4 of 6 · Substantial Presence Test Calculator</div>
        <h1>Days Present in the United States</h1>
        <p class="subtitle">Enter your days for each year. You can type the exact count,
           or use the "every day except…" mode if it's easier to count days you were <em>away</em>.</p>
        ${state.isCurrentYear ? `
          <div class="note" style="margin-bottom:24px;">
            📍 <strong>Right-now calculation:</strong> ${y} is capped at <strong>${state.currentDayOfYear} days</strong>
            (today is ${todayStr}). The prior two years use their full counts as usual.
          </div>
        ` : ''}

        ${yearSection(0, year0Label, '1 × full')}
        <div class="divider"></div>
        ${yearSection(1, `${y - 1} (prior year)`, '1/3 × weight')}
        <div class="divider"></div>
        ${yearSection(2, `${y - 2} (two years ago)`, '1/6 × weight')}
        <div class="divider"></div>

        <div id="spt-result-area">${buildSPTResultHTML()}</div>
      </div>
    `;
  },

  // ── After SPT pass ─────────────────────────────────────────────────────────
  after_spt_pass: () => `
    <div class="card">
      ${back()}
      <div class="label">Step 5 of 6 · Exceptions</div>
      <h1>You meet the Substantial Presence Test — but you may still qualify for an exception</h1>
      <p class="subtitle">Even if you meet the SPT, certain exceptions can preserve your non-resident status.
         Do any of these apply to you?</p>
      <div class="choices">
        ${choice('🏡','Closer Connection Exception','I have a tax home in another country and stronger ties there than to the US','closer_connection_intro')}
        ${choice('🤝','Tax Treaty','My home country has a tax treaty with the US that may affect my residency status','tax_treaty_intro')}
        ${choice('🏥','Medical Condition','I was unable to leave the US due to a medical condition that developed while I was here','medical_exception')}
        ${choice('🗓️','Dual-Status Year','I changed status mid-year (e.g., arrived or received green card partway through the year)','dual_status_info')}
        ${choice('❌','None of these apply','I don\'t qualify for any exception','spt_resident_result')}
      </div>
    </div>
  `,

  // ── After SPT fail ─────────────────────────────────────────────────────────
  after_spt_fail: () => `
    <div class="result-card nonresident">
      ${back()}
      <div class="result-icon">📋</div>
      <h1>You Do Not Meet the Substantial Presence Test</h1>
      <p>Based on the days you entered, your weighted total is <strong>below 183 days</strong>.
         You are a <strong>non-resident alien</strong> for ${state.taxYear}.</p>
      <ul>
        <li>If you had US-source income, file <strong>Form 1040-NR</strong></li>
        <li>Report only US-source income (not worldwide income)</li>
        <li>Cannot claim the standard deduction, but can itemize</li>
      </ul>
      <div class="note">
        ℹ️ Check if you qualify for the <strong>First-Year Choice</strong> election: if you will meet the
        SPT <em>next year</em> and were present for at least 31 consecutive days this year,
        you may be able to elect resident status for the remainder of this year.
        This is a complex election — consult a tax professional.
      </div>
      ${restart()}
    </div>
  `,

  // ── Closer Connection ──────────────────────────────────────────────────────
  closer_connection_intro: () => `
    <div class="card">
      ${back()}
      <div class="label">Closer Connection Exception</div>
      <h1>Closer Connection Exception — Quick Check</h1>
      <p class="subtitle">To claim this exception (filed on <strong>Form 8840</strong>), you must meet <em>all three</em> of the following:</p>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:18px 22px;margin-bottom:28px;font-size:0.95rem;line-height:1.9;">
        <div>1. You were present in the US for <strong>fewer than 183 days</strong> this year</div>
        <div>2. You maintained a <strong>tax home</strong> in a foreign country all year</div>
        <div>3. You had <strong>closer connections</strong> to that foreign country than to the US (family, home, bank accounts, driver's license, social ties, etc.)</div>
      </div>
      <div class="choices">
        ${choice('✅','All three apply to me','I likely qualify for the Closer Connection Exception','closer_connection_result')}
        ${choice('❌','Not all three apply','I don\'t qualify for this exception','after_spt_pass')}
      </div>
    </div>
  `,

  closer_connection_result: () => `
    <div class="result-card exception">
      ${back()}
      <div class="result-icon">🏡</div>
      <h1>You May Qualify for the Closer Connection Exception</h1>
      <p>Despite meeting the Substantial Presence Test, you may be treated as a
         <strong>non-resident alien</strong> by claiming the Closer Connection Exception.</p>
      <p>What you need to do:</p>
      <ul>
        <li>File <strong>Form 8840</strong> (Closer Connection Exception Statement) by the tax return due date</li>
        <li>Attach it to Form 1040-NR, or mail separately if you have no US income</li>
        <li>Filing deadline is <strong>critical</strong> — late filing can disqualify the exception</li>
        <li>You still report only US-source income (not worldwide income)</li>
      </ul>
      <div class="note">
        ⚠️ You cannot claim this exception if you took steps to apply for a green card during the year,
        or if you were present in the US for 183 or more days in the current year (regardless of weighted total).
        Consult a tax professional to confirm your specific circumstances.
      </div>
      ${restart()}
    </div>
  `,

  // ── Tax Treaty ─────────────────────────────────────────────────────────────
  tax_treaty_intro: () => `
    <div class="result-card maybe">
      ${back()}
      <div class="result-icon">🤝</div>
      <h1>Tax Treaty Exception — Requires Research</h1>
      <p>The US has income tax treaties with many countries. Some treaties allow residents of the
         treaty country to be treated as non-residents for US tax purposes, even if they would otherwise
         qualify as residents.</p>
      <p>This is highly country-specific and complex. Key points:</p>
      <ul>
        <li>Student/trainee benefits typically last <strong>4–5 years</strong> from arrival</li>
        <li>Teacher/researcher benefits typically last <strong>2–3 years</strong> from arrival</li>
        <li>Most treaties include a "saving clause" — the US can still tax its own residents as if no treaty existed, <em>except</em> for certain explicitly exempted provisions</li>
        <li>You must <strong>claim</strong> treaty benefits on your tax return (Form 1040-NR + treaty position disclosure)</li>
      </ul>
      <div class="note">
        ℹ️ To look up your country's specific treaty, visit the IRS Tax Treaties page at
        <strong>irs.gov/businesses/international-businesses/united-states-income-tax-treaties-a-to-z</strong>.
        This is complex territory — a tax professional familiar with international taxation is strongly recommended.
      </div>
      ${restart()}
    </div>
  `,

  // ── Medical Exception ──────────────────────────────────────────────────────
  medical_exception: () => `
    <div class="result-card exception">
      ${back()}
      <div class="result-icon">🏥</div>
      <h1>Medical Condition Exception</h1>
      <p>Days when you were <strong>unable to leave the US</strong> due to a medical condition or problem
         that developed while you were in the US can be excluded from the Substantial Presence Test.</p>
      <p>Requirements:</p>
      <ul>
        <li>You must have <strong>intended to leave</strong> before the condition arose</li>
        <li>The condition must have prevented your departure</li>
        <li>You must file <strong>Form 8843</strong> to exclude these days</li>
        <li>Without timely filing of Form 8843, the excluded days still count toward the SPT</li>
      </ul>
      <div class="note">
        ℹ️ Even if some days are excluded, you may still meet the SPT with the remaining days.
        Consider whether the Closer Connection Exception might also apply.
        Consult a tax professional to determine your exact residency status after the exclusion.
      </div>
      ${restart()}
    </div>
  `,

  // ── Dual-status ────────────────────────────────────────────────────────────
  dual_status_info: () => `
    <div class="result-card maybe">
      ${back()}
      <div class="result-icon">🗓️</div>
      <h1>You May Be a Dual-Status Taxpayer</h1>
      <p>If your residency status changed during ${state.taxYear} — for example, you arrived mid-year and
         eventually met the SPT, or received a green card partway through the year — you may be a
         <strong>dual-status taxpayer</strong>.</p>
      <p>What this means:</p>
      <ul>
        <li>Part of the year you're treated as a <strong>resident alien</strong> (report worldwide income)</li>
        <li>Part of the year you're treated as a <strong>non-resident alien</strong> (only US-source income)</li>
        <li>File a combined <strong>Form 1040</strong> labeled "Dual Status Return" with Form 1040-NR attached</li>
        <li>Cannot claim the standard deduction; cannot file as married filing jointly (in most cases)</li>
      </ul>
      <div class="note">
        ℹ️ Dual-status returns are complex. There is also a special <strong>First-Year Choice</strong> election
        that may allow you to be treated as a resident for the entire year (if you will meet the SPT
        in the following year). Both options have trade-offs — a tax professional is strongly recommended.
      </div>
      ${restart()}
    </div>
  `,

  // ── SPT Resident Result ────────────────────────────────────────────────────
  spt_resident_result: () => `
    <div class="result-card resident">
      ${back()}
      <div class="result-icon">✅</div>
      <h1>You Are a US Tax Resident</h1>
      <p>You meet the <strong>Substantial Presence Test</strong> and do not qualify for any exception.
         You are treated as a <strong>resident alien</strong> for ${state.taxYear}.</p>
      <p>What this means:</p>
      <ul>
        <li>File <strong>Form 1040</strong> (same form as US citizens)</li>
        <li>Report your <strong>worldwide income</strong> — income from all countries</li>
        <li>You can claim the standard deduction</li>
        <li>You may be eligible for most tax credits</li>
        <li>Foreign tax credits or deductions may reduce double taxation on foreign income</li>
      </ul>
      <div class="note">
        ℹ️ As a resident alien, you may also have FBAR (FinCEN 114) and FATCA (Form 8938) obligations
        if you hold foreign financial accounts or assets above certain thresholds.
        Check the IRS international taxpayer pages for details.
      </div>
      ${restart()}
    </div>
  `,
};

// ─── Navigation ───────────────────────────────────────────────────────────────
const STEP_ORDER = [
  'welcome','year_select','green_card','visa_type','partial_exempt_check',
  'check_spt_needed','spt_intro','spt_calc','after_spt_pass'
];

function getProgress(stepId) {
  const idx = STEP_ORDER.indexOf(stepId);
  if (idx < 0) return 100;
  return Math.round((idx / (STEP_ORDER.length - 1)) * 100);
}

function goTo(stepId) {
  if (!(stepId in steps)) { console.warn('Unknown step:', stepId); return; }
  state.history.push(state.currentStep);
  state.currentStep = stepId;
  render();
}

function goBack() {
  if (state.history.length === 0) return;
  state.currentStep = state.history.pop();
  render();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  const area = document.getElementById('question-area');
  const pb   = document.getElementById('progress-bar');

  const stepFn = steps[state.currentStep];
  area.innerHTML = stepFn ? stepFn() : '<p>Unknown step</p>';
  pb.style.width = getProgress(state.currentStep) + '%';

  // Scroll to top on each step transition
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
render();
