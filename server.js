import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import RetellClient from "retell-sdk";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

console.log("[startup] RETELL_API_KEY present:", Boolean(process.env.RETELL_API_KEY));
console.log("[startup] FROM_NUMBER:", process.env.FROM_NUMBER || "(not set)");
console.log("[startup] AGENT_ID (fallback):", process.env.AGENT_ID || "(not set)");
console.log("[startup] AGENT_VERSION (global):", process.env.AGENT_VERSION || "(not set)");

if (!process.env.RETELL_API_KEY) {
  console.warn("[startup] WARNING: RETELL_API_KEY is missing. Calls to Retell will fail with 401.");
}
if (!process.env.FROM_NUMBER) {
  console.warn("[startup] WARNING: FROM_NUMBER is missing. Calls will fail validation (from_number is required).");
}

const client = new RetellClient({
  apiKey: process.env.RETELL_API_KEY,
});

app.use(bodyParser.json());
app.use(express.static("public"));

app.use((req, res, next) => {
  console.log(`[request] ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

/**
 * Agent mapping
 * Keys correspond to select option values from the client
 * Replace these strings if you have different agent ids
 */
const AGENTS = {
  compareCoverage: "agent_5c35a64fa13e88b5c7c3eac234",
  chooseYourPlan: "agent_ecc3b338b585ff3fc18ab6f6c9",
  completePayment: "agent_5eb050b2d4800fe5461953a328",
  completeOnboarding: "agent_dd651bab92cda76d26ced5c988",
};

/**
 * Optional per-agent version map:
 * - You can set env vars like AGENT_VERSION_compareCoverage=2
 * - If not provided, the code will use process.env.AGENT_VERSION (global) if present
 */
function getAgentVersionForKey(key) {
  const envKey = `AGENT_VERSION_${key}`; // e.g. AGENT_VERSION_compareCoverage
  if (process.env[envKey]) {
    const v = parseInt(process.env[envKey], 10);
    return Number.isFinite(v) ? v : undefined;
  }
  if (process.env.AGENT_VERSION) {
    const v = parseInt(process.env.AGENT_VERSION, 10);
    return Number.isFinite(v) ? v : undefined;
  }
  return undefined;
}

// Serve the test console (split layout, index-list agent picker)
app.get("/", (req, res) => {
  const fromNumberLabel = process.env.FROM_NUMBER || "not configured";
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="Internal console for placing test calls through Pru Mate's Retell AI voice agents." />
      <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='2' y='9' width='3' height='6' rx='1' fill='%2310b981'/%3E%3Crect x='7' y='5' width='3' height='14' rx='1' fill='%2310b981'/%3E%3Crect x='12' y='2' width='3' height='20' rx='1' fill='%2310b981'/%3E%3Crect x='17' y='5' width='3' height='14' rx='1' fill='%2310b981'/%3E%3C/svg%3E" />
      <title>Pru Mate — Voice Agent Test Console</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        body { font-family: 'Outfit', ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }

        /* Vertical index-list rows for test-category selection */
        .agent-row {
          border-left: 2px solid transparent;
          padding-left: .875rem; margin-left: -.875rem;
          transition: border-color .15s ease, background-color .15s ease, transform .1s ease;
        }
        .agent-row:hover { background-color: rgba(255,255,255,0.025); }
        .agent-row:active { transform: scale(0.995); }
        .agent-row.selected { border-left-color: #10b981; background-color: rgba(16,185,129,0.055); }
        .agent-row.selected .agent-index { color: #34d399; }

        .wave-loader { display: inline-flex; align-items: center; gap: 2px; height: 14px; vertical-align: middle; }
        .wave-loader span { width: 2px; height: 100%; background: currentColor; border-radius: 1px; animation: waveBar .9s ease-in-out infinite; }
        .wave-loader span:nth-child(2) { animation-delay: .1s; }
        .wave-loader span:nth-child(3) { animation-delay: .2s; }
        .wave-loader span:nth-child(4) { animation-delay: .3s; }
        @keyframes waveBar { 0%, 100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }

        ::selection { background: rgba(16,185,129,0.3); }

        #submitBtn { transition: transform .12s ease, background-color .15s ease; }
        #submitBtn:hover:not(:disabled) { transform: translateY(-1px); }
        #submitBtn:active:not(:disabled) { transform: translateY(0) scale(0.99); }

        .field-input { outline: none; }
        .field-input { border-color: #27272a; }
        .field-input:focus { border-color: #10b981; }
        .field-input.invalid { border-color: #f43f5e; }
        .field-input.invalid:focus { border-color: #f43f5e; }
        .field-input.valid { border-color: #10b981; }

        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { opacity: 0; animation: fadeInUp .5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

        /* Ambient idle waveform — signal motif, not decoration for its own sake */
        .idle-wave { display: flex; align-items: flex-end; gap: 3px; height: 4rem; }
        .idle-wave span {
          flex: 1; background: rgba(16,185,129,0.35); border-radius: 1px;
          animation: waveIdle 2.6s ease-in-out infinite;
        }
        @keyframes waveIdle { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }

        @keyframes resultIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .result-in { animation: resultIn .3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

        @media (prefers-reduced-motion: reduce) {
          .fade-in, .result-in, .wave-loader span, .idle-wave span { animation: none !important; opacity: 1 !important; }
        }
      </style>
    </head>
    <body class="bg-zinc-950 min-h-[100dvh]">
      <div class="min-h-[100dvh] grid grid-cols-1 lg:grid-cols-12">

        <!-- Left: brand / signal panel -->
        <aside class="lg:col-span-5 lg:border-r border-zinc-800 px-6 py-10 sm:px-10 sm:py-14 lg:p-16 flex flex-col justify-between">
          <div class="fade-in" style="animation-delay:.03s">
            <div class="flex items-center gap-2 mb-12">
              <span id="statusDot" class="inline-block w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
              <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">Idle</span>
            </div>
            <p class="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-600 mb-4">Pru Mate — Test Console</p>
            <h1 class="text-4xl sm:text-5xl font-semibold tracking-tight text-zinc-100 leading-[1.05] mb-6">
              Every plan flow,<br/>dialed on demand.
            </h1>
            <p class="text-zinc-500 text-base leading-relaxed max-w-sm">
              Trigger a live outbound call through any Retell agent and see the result land in seconds.
            </p>
          </div>

          <div class="fade-in mt-16 lg:mt-0" style="animation-delay:.12s">
            <div class="idle-wave mb-4">
              <span style="height:40%;animation-delay:0.00s"></span>
              <span style="height:65%;animation-delay:0.07s"></span>
              <span style="height:30%;animation-delay:0.14s"></span>
              <span style="height:80%;animation-delay:0.21s"></span>
              <span style="height:50%;animation-delay:0.28s"></span>
              <span style="height:90%;animation-delay:0.35s"></span>
              <span style="height:35%;animation-delay:0.42s"></span>
              <span style="height:60%;animation-delay:0.49s"></span>
              <span style="height:45%;animation-delay:0.56s"></span>
              <span style="height:75%;animation-delay:0.63s"></span>
              <span style="height:55%;animation-delay:0.70s"></span>
              <span style="height:25%;animation-delay:0.77s"></span>
              <span style="height:70%;animation-delay:0.84s"></span>
              <span style="height:42%;animation-delay:0.91s"></span>
              <span style="height:85%;animation-delay:0.98s"></span>
              <span style="height:38%;animation-delay:1.05s"></span>
            </div>
            <p class="font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-600">Dialing from ${fromNumberLabel}</p>
          </div>
        </aside>

        <!-- Right: form -->
        <main class="lg:col-span-7 px-6 py-10 sm:px-10 sm:py-14 lg:p-16">
          <form id="callForm" class="max-w-md space-y-10">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-9">
              <div class="fade-in" style="animation-delay:.05s">
                <label for="name" class="block font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 mb-2">Full name</label>
                <div class="relative">
                  <svg class="absolute left-0 top-1/2 -translate-y-1/2 text-zinc-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
                  </svg>
                  <input type="text" name="name" id="name" required autocomplete="name"
                    class="field-input w-full bg-transparent border-0 border-b border-zinc-800 pl-6 pb-2.5 text-zinc-100 placeholder-zinc-700 transition-colors duration-150"
                    placeholder="Alicia Ferreira" />
                </div>
                <p id="nameHint" class="font-mono text-[11px] mt-2 min-h-[1.1rem] text-zinc-700">Used as the caller's name inside the script</p>
              </div>

              <div class="fade-in" style="animation-delay:.08s">
                <label for="phone" class="block font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 mb-2">Phone (E.164)</label>
                <div class="relative">
                  <svg class="absolute left-0 top-1/2 -translate-y-1/2 text-zinc-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 5c0 8.284 6.716 15 15 15l3-4-6-3-2 2c-2.5-1.2-4.3-3-5.5-5.5l2-2-3-6-4 3Z" />
                  </svg>
                  <input type="tel" name="phone" id="phone" required autocomplete="tel" inputmode="tel"
                    class="field-input w-full bg-transparent border-0 border-b border-zinc-800 pl-6 pb-2.5 text-zinc-100 placeholder-zinc-700 transition-colors duration-150 font-mono"
                    placeholder="+1 415 555 0148" />
                </div>
                <p id="phoneHint" class="font-mono text-[11px] mt-2 min-h-[1.1rem] text-zinc-700">Country code required, e.g. +1, +44, +91</p>
              </div>
            </div>

            <div class="fade-in" style="animation-delay:.12s">
              <p class="font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500 mb-1">Test category</p>
              <input type="hidden" name="agentKey" id="agentKey" value="compareCoverage" />
              <div id="agentCards" class="border-t border-zinc-800">
                <button type="button" data-key="compareCoverage" class="agent-row selected w-full flex items-baseline gap-5 text-left py-4 border-b border-zinc-800">
                  <span class="agent-index font-mono text-xs text-zinc-600 w-5 shrink-0">01</span>
                  <span>
                    <span class="block text-sm font-medium text-zinc-100">Compare coverage</span>
                    <span class="block text-xs text-zinc-500 mt-0.5">Walks through plan coverage comparisons</span>
                  </span>
                </button>
                <button type="button" data-key="chooseYourPlan" class="agent-row w-full flex items-baseline gap-5 text-left py-4 border-b border-zinc-800">
                  <span class="agent-index font-mono text-xs text-zinc-600 w-5 shrink-0">02</span>
                  <span>
                    <span class="block text-sm font-medium text-zinc-100">Choose your plan</span>
                    <span class="block text-xs text-zinc-500 mt-0.5">Guides selection of the right plan</span>
                  </span>
                </button>
                <button type="button" data-key="completePayment" class="agent-row w-full flex items-baseline gap-5 text-left py-4 border-b border-zinc-800">
                  <span class="agent-index font-mono text-xs text-zinc-600 w-5 shrink-0">03</span>
                  <span>
                    <span class="block text-sm font-medium text-zinc-100">Complete payment</span>
                    <span class="block text-xs text-zinc-500 mt-0.5">Handles payment completion flow</span>
                  </span>
                </button>
                <button type="button" data-key="completeOnboarding" class="agent-row w-full flex items-baseline gap-5 text-left py-4 border-b border-zinc-800">
                  <span class="agent-index font-mono text-xs text-zinc-600 w-5 shrink-0">04</span>
                  <span>
                    <span class="block text-sm font-medium text-zinc-100">Complete onboarding</span>
                    <span class="block text-xs text-zinc-500 mt-0.5">Steps through onboarding completion</span>
                  </span>
                </button>
              </div>
            </div>

            <button type="submit" id="submitBtn"
              class="fade-in w-full bg-emerald-600 text-zinc-950 font-medium py-3.5 hover:bg-emerald-500 flex items-center justify-center gap-2"
              style="animation-delay:.16s">
              <span id="submitLabel">Call now</span>
            </button>
          </form>

          <div id="responseBox" class="max-w-md mt-8 hidden"></div>
        </main>
      </div>

      <script>
        const form = document.getElementById('callForm');
        const responseBox = document.getElementById('responseBox');
        const agentCards = document.getElementById('agentCards');
        const agentKeyInput = document.getElementById('agentKey');
        const nameInput = document.getElementById('name');
        const nameHint = document.getElementById('nameHint');
        const phoneInput = document.getElementById('phone');
        const phoneHint = document.getElementById('phoneHint');
        const submitBtn = document.getElementById('submitBtn');
        const submitLabel = document.getElementById('submitLabel');
        const statusDot = document.getElementById('statusDot');

        agentCards.querySelectorAll('.agent-row').forEach((row) => {
          row.addEventListener('click', () => {
            agentCards.querySelectorAll('.agent-row').forEach((r) => r.classList.remove('selected'));
            row.classList.add('selected');
            agentKeyInput.value = row.dataset.key;
          });
        });

        function setFieldState(input, hint, state, message) {
          input.classList.remove('valid', 'invalid');
          if (state) input.classList.add(state);
          hint.textContent = message;
          hint.className = 'font-mono text-[11px] mt-2 min-h-[1.1rem] ' +
            (state === 'invalid' ? 'text-rose-400' : state === 'valid' ? 'text-emerald-400' : 'text-zinc-700');
        }

        function validateName(showError) {
          const v = nameInput.value.trim();
          if (!v) {
            if (showError) setFieldState(nameInput, nameHint, 'invalid', 'Full name is required');
            else setFieldState(nameInput, nameHint, null, "Used as the caller's name inside the script");
            return false;
          }
          setFieldState(nameInput, nameHint, 'valid', "Used as the caller's name inside the script");
          return true;
        }

        function validatePhone(showError) {
          const v = phoneInput.value.trim();
          if (!v) {
            if (showError) setFieldState(phoneInput, phoneHint, 'invalid', 'Phone number is required');
            else setFieldState(phoneInput, phoneHint, null, 'Country code required, e.g. +1, +44, +91');
            return false;
          }
          const normalized = v.startsWith('+') ? v : '+' + v;
          const digits = normalized.replace(/\\D/g, '');
          if (digits.length < 8 || digits.length > 15) {
            setFieldState(phoneInput, phoneHint, 'invalid', 'Enter a full number with country code, e.g. +14155550148');
            return false;
          }
          setFieldState(phoneInput, phoneHint, 'valid', 'Will call ' + normalized);
          return true;
        }

        nameInput.addEventListener('input', () => validateName(false));
        nameInput.addEventListener('blur', () => validateName(true));
        phoneInput.addEventListener('input', () => validatePhone(false));
        phoneInput.addEventListener('blur', () => validatePhone(true));

        function setStatus(label, colorClass) {
          statusDot.className = 'inline-block w-1.5 h-1.5 rounded-full ' + colorClass;
          statusDot.parentElement.querySelector('span:last-child').textContent = label;
        }

        function copyToClipboard(text, btn) {
          navigator.clipboard.writeText(text).then(() => {
            const original = btn.textContent;
            btn.textContent = 'Copied';
            setTimeout(() => { btn.textContent = original; }, 1200);
          });
        }
        window.__copyToClipboard = copyToClipboard;

        form.addEventListener('submit', async (e) => {
          e.preventDefault();

          const nameOk = validateName(true);
          const phoneOk = validatePhone(true);
          if (!nameOk) { nameInput.focus(); return; }
          if (!phoneOk) { phoneInput.focus(); return; }

          responseBox.classList.remove('hidden');
          submitBtn.disabled = true;
          submitLabel.innerHTML = '<span class="wave-loader"><span></span><span></span><span></span><span></span></span> Dialing';
          setStatus('Dialing', 'bg-amber-500');
          responseBox.innerHTML = '<div class="result-in font-mono text-xs text-zinc-500">Initiating call…</div>';

          const name = document.getElementById('name').value.trim();
          const phone = phoneInput.value.trim();
          const agentKey = agentKeyInput.value;

          // basic client-side phone normalization: ensure starts with +
          const normalizedPhone = phone.startsWith('+') ? phone : '+' + phone;

          try {
            const response = await fetch('/call', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, phone: normalizedPhone, agentKey })
            });

            const data = await response.json();
            if (data.success) {
              setStatus('Call initiated', 'bg-emerald-500');
              responseBox.innerHTML = \`
                <div class="result-in border-t border-zinc-800 pt-4">
                  <div class="text-sm font-medium text-emerald-400 mb-3">Call initiated</div>
                  <dl class="font-mono text-xs text-zinc-500 space-y-2">
                    <div class="flex justify-between gap-4">
                      <dt>call_id</dt>
                      <dd class="text-zinc-300 truncate">\${data.call_id}
                        <button type="button" onclick="window.__copyToClipboard('\${data.call_id}', this)" class="ml-2 text-emerald-400 hover:text-emerald-300" style="font-family:'Outfit',sans-serif">copy</button>
                      </dd>
                    </div>
                    <div class="flex justify-between gap-4">
                      <dt>status</dt>
                      <dd class="text-zinc-300">\${data.call_status}</dd>
                    </div>
                    <div class="flex justify-between gap-4">
                      <dt>agent</dt>
                      <dd class="text-zinc-300">\${data.agent_id || 'default'}</dd>
                    </div>
                  </dl>
                </div>
              \`;
            } else {
              setStatus('Failed', 'bg-rose-500');
              responseBox.innerHTML = \`
                <div class="result-in border-l-2 border-rose-500 pl-4 py-1 text-sm text-rose-400">
                  Error: \${data.message || 'Unable to create call.'}
                </div>
              \`;
            }
          } catch (err) {
            setStatus('Failed', 'bg-rose-500');
            responseBox.innerHTML = \`
              <div class="result-in border-l-2 border-rose-500 pl-4 py-1 text-sm text-rose-400">
                Error: \${err.message || 'Unknown error'}
              </div>
            \`;
          } finally {
            submitBtn.disabled = false;
            submitLabel.textContent = 'Call Now';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// API endpoint
app.post("/call", async (req, res) => {
  console.log("[/call] incoming body:", req.body);
  try {
    const { name, phone, agentKey } = req.body;

    if (!name || !phone) {
      console.warn("[/call] validation failed: missing name or phone", { name, phone });
      return res.json({ success: false, message: "Missing name or phone" });
    }

    const formattedPhone = phone.startsWith("+") ? phone : "+" + phone;

    // pick agent id from map; fallback to global env AGENT_ID if not found
    const selectedAgentId = AGENTS[agentKey] || process.env.AGENT_ID;
    const selectedAgentVersion = getAgentVersionForKey(agentKey);

    console.log("[/call] agentKey:", agentKey, "-> selectedAgentId:", selectedAgentId, "selectedAgentVersion:", selectedAgentVersion);

    // build call payload
    const callPayload = {
      from_number: process.env.FROM_NUMBER,
      to_number: formattedPhone,
      retell_llm_dynamic_variables: {
        name: name
      }
    };

    if (selectedAgentId) {
      callPayload.override_agent_id = selectedAgentId;
    }
    // only include version if it's defined and a number
    if (typeof selectedAgentVersion === "number") {
      callPayload.override_agent_version = selectedAgentVersion;
    }

    console.log("[/call] sending payload to Retell:", JSON.stringify(callPayload, null, 2));

    const response = await client.call.createPhoneCall(callPayload);

    console.log("[/call] Retell response:", JSON.stringify(response, null, 2));

    res.json({
      success: true,
      call_id: response.call_id,
      call_status: response.call_status,
      agent_id: selectedAgentId,
      agent_version: selectedAgentVersion,
    });
  } catch (error) {
    console.error("[/call] ERROR full object:", error);
    console.error("[/call] ERROR status:", error?.status);
    console.error("[/call] ERROR body/response:", error?.error || error?.response?.data || "(none)");
    res.json({
      success: false,
      message: error?.error?.message || error.message || "Unknown error occurred",
    });
  }
});


app.listen(port, () =>
  console.log(`🚀 Retell Call Portal running at http://localhost:${port}`)
);
