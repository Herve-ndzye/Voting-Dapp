
const ABI = [
  {
      "inputs": [],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "candidateId",
          "type": "uint256"
        }
      ],
      "name": "votedEvent",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "candidates",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "string",
          "name": "name",
          "type": "string"
        },
        {
          "internalType": "uint256",
          "name": "voteCount",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    },
    {
      "inputs": [],
      "name": "candidatesCount",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "voters",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "_name",
          "type": "string"
        }
      ],
      "name": "addCandidate",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_candidateId",
          "type": "uint256"
        }
      ],
      "name": "vote",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
];

// ── Config — CHANGE THIS ────────────────────────────────────────
const CONTRACT_ADDRESS = "0x0dCFf3C9675DE7A6fe288E192E33308b1A90fb22"; // ← replace

// ── Palette per candidate slot ─────────────────────────────────
const PALETTES = [
  { ac: "#2b5ce6", acGlow: "rgba(43,92,230,0.18)",   acDim: "rgba(43,92,230,0.08)"  },
  { ac: "#7c51d4", acGlow: "rgba(124,81,212,0.18)",  acDim: "rgba(124,81,212,0.08)" },
  { ac: "#0a9e7c", acGlow: "rgba(10,158,124,0.18)",  acDim: "rgba(10,158,124,0.08)" },
  { ac: "#d97706", acGlow: "rgba(217,119,6,0.18)",   acDim: "rgba(217,119,6,0.08)"  },
  { ac: "#dc2626", acGlow: "rgba(220,38,38,0.18)",   acDim: "rgba(220,38,38,0.08)"  }
];

// ── State ──────────────────────────────────────────────────────
let web3, contract;
let currentAccount   = null;
let hasVoted         = false;
let eventSubscription = null;  // holds the votedEvent subscription

// ── Init ───────────────────────────────────────────────────────
window.addEventListener("load", () => {
  if (typeof window.ethereum !== "undefined") {
    setStatus("MetaMask detected — connect your wallet to participate.", "info");
  } else {
    setStatus("MetaMask not found. Please install a Web3 wallet to use VoteChain.", "error");
    document.getElementById("connect-btn").disabled = true;
  }
});

// ── Connect wallet ─────────────────────────────────────────────
async function connectWallet() {
  const btn = document.getElementById("connect-btn");
  btn.textContent = "Connecting…";
  btn.disabled = true;

  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    currentAccount = accounts[0];

    web3     = new Web3(window.ethereum);
    contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

    // ── Network validation ─────────────────────────────────────
    const chainId = await web3.eth.getChainId();
    const ok = await validateNetwork(chainId);
    if (!ok) {
      btn.textContent = "Connect Wallet";
      btn.disabled    = false;
      return;
    }

    // Show shortened address pill
    const pill = document.getElementById("wallet-pill");
    pill.textContent = shortAddr(currentAccount);
    pill.classList.add("show");

    btn.textContent = "Connected";
    btn.classList.add("connected");
    btn.disabled = false;

    // Show contract in footer
    document.getElementById("footer-addr").textContent = shortAddr(CONTRACT_ADDRESS, 10);

    await checkVoterStatus();
    await loadCandidates();

    // ── Subscribe to votedEvent for live updates ───────────────
    subscribeToVotedEvent();

    // Listen for account / chain switches
    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged",    () => window.location.reload());

    if (!hasVoted) {
      setStatus("Wallet connected. Select a candidate and cast your vote.", "success");
    }

  } catch (err) {
    btn.textContent = "Connect Wallet";
    btn.disabled    = false;
    if (err.code === 4001) {
      setStatus("Connection rejected. Please try again.", "error");
    } else {
      setStatus("Could not connect: " + (err.message || "Unknown error"), "error");
    }
  }
}

// ── Network validation ─────────────────────────────────────────
// Returns true if the network is acceptable, false + shows error otherwise.
// Edit ALLOWED_CHAIN_IDS to match your deployment network(s).
const NETWORK_NAMES = {
  1:        "Ethereum Mainnet",
  5:        "Goerli Testnet",
  11155111: "Sepolia Testnet",
  1337:     "Localhost / Ganache",
  31337:    "Hardhat Network"
};
// Accept any of the above; tighten this list in production.
const ALLOWED_CHAIN_IDS = Object.keys(NETWORK_NAMES).map(Number);

async function validateNetwork(chainId) {
  const badge = document.getElementById("net-badge-name");
  const name  = NETWORK_NAMES[chainId] || `Chain ${chainId}`;
  if (badge) badge.textContent = name;

  if (!ALLOWED_CHAIN_IDS.includes(chainId)) {
    setStatus(
      `Wrong network detected (Chain ID: ${chainId}). ` +
      `Please switch to one of: ${Object.values(NETWORK_NAMES).join(", ")}.`,
      "error"
    );
    return false;
  }
  return true;
}

// ── Subscribe to on-chain votedEvent ──────────────────────────
// Any time anyone votes (not just the current user) the candidate list
// refreshes automatically, keeping vote counts live for all viewers.
function subscribeToVotedEvent() {
  // Clean up any previous subscription first
  if (eventSubscription) {
    try { eventSubscription.unsubscribe(); } catch (_) {}
  }

  eventSubscription = contract.events.votedEvent({ fromBlock: "latest" })
    .on("data", async (event) => {
      const candidateId = parseInt(event.returnValues.candidateId);
      console.log(`[votedEvent] Candidate #${candidateId} received a vote.`);
      // Refresh counts without re-checking voter status (avoids flash)
      await loadCandidates(/* silent */ true);
    })
    .on("error", (err) => {
      console.warn("[votedEvent subscription error]", err);
    });

  // Signal to the UI that live updates are active
  if (typeof showLiveBadge === "function") showLiveBadge();
}

// ── Check if address already voted ────────────────────────────
async function checkVoterStatus() {
  try {
    hasVoted = await contract.methods.voters(currentAccount).call();
    if (hasVoted) {
      setStatus("This address has already cast a vote. Each address may vote only once.", "info");
    }
    // Update the status stat chip
    const ss = document.getElementById("stat-status");
    if (ss && hasVoted) {
      ss.textContent = "VOTED";
      ss.style.color = "var(--amber)";
    }
  } catch (err) {
    console.warn("checkVoterStatus:", err);
  }
}

// ── Load all candidates ────────────────────────────────────────
// silent=true skips showing the status banner on auto-refresh from events
async function loadCandidates(silent = false) {
  try {
    const count = parseInt(await contract.methods.candidatesCount().call());
    const list  = [];

    for (let i = 1; i <= count; i++) {
      const c = await contract.methods.candidates(i).call();
      list.push({
        id:        parseInt(c.id),
        name:      c.name.trim(),
        voteCount: parseInt(c.voteCount)
      });
    }

    renderCandidates(list);

    // Dynamically update the Candidates stat (was hardcoded to 3)
    const statCandidates = document.getElementById("stat-candidates");
    if (statCandidates) statCandidates.textContent = count;

  } catch (err) {
    if (!silent) setStatus("Error loading candidates: " + err.message, "error");
    console.error(err);
  }
}

// ── Render candidate cards ─────────────────────────────────────
function renderCandidates(list) {
  const total     = list.reduce((s, c) => s + c.voteCount, 0);
  const container = document.getElementById("candidates");

  // On a live refresh (from event), update counts in-place if cards exist,
  // only do a full re-render when the count changes (new candidate added).
  const existingCards = container.querySelectorAll(".c-card");
  if (existingCards.length === list.length) {
    // Smooth in-place update
    list.forEach((c) => {
      const voteEl = document.getElementById(`votes-${c.id}`);
      const barEl  = container.querySelector(`[data-id="${c.id}"] .bar-fill`);
      const pctEl  = container.querySelector(`[data-id="${c.id}"] .bar-pct`);
      const pct    = total > 0 ? ((c.voteCount / total) * 100).toFixed(1) : "0.0";
      if (voteEl) voteEl.textContent = `${c.voteCount} vote${c.voteCount !== 1 ? "s" : ""}`;
      if (barEl)  barEl.style.setProperty("--pct", pct + "%");
      if (pctEl)  pctEl.textContent = pct + "%";
    });
    animateCounter("stat-total", total);
    return;
  }

  // Full re-render
  container.innerHTML = "";
  animateCounter("stat-total", total);

  list.forEach((c, idx) => {
    const pal  = PALETTES[idx % PALETTES.length];
    const pct  = total > 0 ? ((c.voteCount / total) * 100).toFixed(1) : "0.0";
    const card = document.createElement("div");

    card.className  = "c-card";
    card.dataset.id = c.id;
    card.style.setProperty("--ac",      pal.ac);
    card.style.setProperty("--ac-glow", pal.acGlow);
    card.style.setProperty("--ac-dim",  pal.acDim);

    card.innerHTML = `
      <div class="c-top">
        <div class="c-rank">#${idx + 1}</div>
        <div class="c-meta">
          <div class="c-avatar">${escHtml(c.name.charAt(0))}</div>
          <div>
            <div class="c-name">${escHtml(c.name)}</div>
            <div class="c-votes" id="votes-${c.id}">
              ${c.voteCount} vote${c.voteCount !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        <button
          class="vote-btn${hasVoted ? " voted" : ""}"
          id="btn-${c.id}"
          onclick="castVote(${c.id})"
          ${hasVoted ? "disabled" : ""}
          style="--ac:${pal.ac};--ac-glow:${pal.acGlow}"
        >
          <span class="btn-label">${hasVoted ? "Voted ✓" : "Cast Vote"}</span>
          ${hasVoted ? "" : '<span class="btn-arrow">→</span>'}
        </button>
      </div>
      <div class="c-bar-row">
        <div class="bar-track">
          <div class="bar-fill" style="--pct:0%"></div>
        </div>
        <div class="bar-pct">${pct}%</div>
      </div>
    `;

    container.appendChild(card);

    // Stagger entrance + animate bar
    setTimeout(() => {
      card.classList.add("in");
      setTimeout(() => {
        card.querySelector(".bar-fill").style.setProperty("--pct", pct + "%");
      }, 50);
    }, idx * 130);
  });
}

// ── Cast vote ─────────────────────────────────────────────────
async function castVote(candidateId) {
  if (!currentAccount) {
    setStatus("Connect your wallet first.", "error"); return;
  }
  if (hasVoted) {
    setStatus("You have already voted from this address.", "error"); return;
  }

  const btn = document.getElementById(`btn-${candidateId}`);
  btn.classList.add("loading");
  btn.innerHTML = '<i class="spin">⟳</i> Confirming…';
  btn.disabled  = true;

  setStatus("Waiting for transaction confirmation…", "pending");

  try {
    const tx = await contract.methods.vote(candidateId).send({ from: currentAccount });

    hasVoted = true;
    setStatus(
      `✓ Vote recorded! Tx: <span style="word-break:break-all">${tx.transactionHash}</span>`,
      "success"
    );

    markAllVoted();
    await loadCandidates();
    launchConfetti();

  } catch (err) {
    btn.classList.remove("loading");
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-label">Cast Vote</span><span class="btn-arrow">→</span>';

    if (err.code === 4001) {
      setStatus("Transaction cancelled.", "error");
    } else if (err.message && err.message.toLowerCase().includes("already voted")) {
      setStatus("This address has already voted on-chain.", "error");
      hasVoted = true; markAllVoted();
    } else if (err.message && err.message.toLowerCase().includes("invalid candidate")) {
      // ── NEW: handle the contract's "Invalid candidate" revert ──
      setStatus("Invalid candidate ID — the contract rejected this vote.", "error");
    } else {
      setStatus("Transaction failed: " + (err.message || "Unknown error"), "error");
    }
  }
}

// ── Add Candidate ──────────────────────────────────────────────
// Calls the public addCandidate(string) function on the contract.
// The contract doesn't restrict who can call this; gate it yourself
// in a production deployment (e.g. onlyOwner modifier).
async function addCandidate() {
  const input  = document.getElementById("new-candidate-input");
  const rawName = (input ? input.value : "").trim();

  if (!currentAccount) {
    setStatus("Connect your wallet first.", "error"); return;
  }
  if (!rawName) {
    setStatus("Please enter a candidate name.", "error");
    input && input.focus(); return;
  }
  if (rawName.length > 64) {
    setStatus("Candidate name must be 64 characters or fewer.", "error"); return;
  }

  const addBtn = document.getElementById("add-candidate-btn");
  if (addBtn) { addBtn.disabled = true; addBtn.textContent = "Adding…"; }

  setStatus(`Submitting "${rawName}" to the contract…`, "pending");

  try {
    const tx = await contract.methods.addCandidate(rawName).send({ from: currentAccount });

    setStatus(
      `✓ Candidate "${escHtml(rawName)}" added! Tx: ` +
      `<span style="word-break:break-all">${tx.transactionHash}</span>`,
      "success"
    );

    if (input) input.value = "";
    await loadCandidates(); // reload to show new candidate

  } catch (err) {
    if (err.code === 4001) {
      setStatus("Transaction cancelled.", "error");
    } else {
      setStatus("Failed to add candidate: " + (err.message || "Unknown error"), "error");
    }
  } finally {
    if (addBtn) { addBtn.disabled = false; addBtn.textContent = "Add Candidate"; }
  }
}

// ── Mark all vote buttons as used ─────────────────────────────
function markAllVoted() {
  document.querySelectorAll(".vote-btn").forEach(btn => {
    btn.disabled  = true;
    btn.className = "vote-btn voted";
    btn.innerHTML = '<span class="btn-label">Voted ✓</span>';
  });
  const ss = document.getElementById("stat-status");
  if (ss) { ss.textContent = "VOTED"; ss.style.color = "var(--amber)"; }
}

// ── Account changed handler ────────────────────────────────────
async function onAccountsChanged(accounts) {
  // Unsubscribe from events before switching
  if (eventSubscription) {
    try { eventSubscription.unsubscribe(); } catch (_) {}
    eventSubscription = null;
  }

  if (!accounts.length) {
    currentAccount = null;
    hasVoted       = false;
    document.getElementById("wallet-pill").classList.remove("show");
    const btn = document.getElementById("connect-btn");
    btn.textContent = "Connect Wallet";
    btn.classList.remove("connected");
    setStatus("Wallet disconnected.", "info");
    document.getElementById("candidates").innerHTML =
      `<div id="placeholder" style="padding:3.5rem 1rem;text-align:center;border:1px dashed var(--border);
        font-family:'JetBrains Mono',monospace;font-size:.8rem;color:var(--text-muted)">
        Reconnect your wallet to continue…</div>`;
    return;
  }

  currentAccount = accounts[0];
  hasVoted = false;
  document.getElementById("wallet-pill").textContent = shortAddr(currentAccount);
  const btn = document.getElementById("connect-btn");
  btn.textContent = "Connected";
  btn.classList.add("connected");

  await checkVoterStatus();
  await loadCandidates();
  subscribeToVotedEvent();

  if (!hasVoted) setStatus("Account switched. Ready to vote.", "info");
}

// ── Status helper ──────────────────────────────────────────────
function setStatus(html, type) {
  const el = document.getElementById("status-msg");
  el.innerHTML     = html;
  el.className     = `status-message ${type}`;
  el.style.display = "block";
}

// ── Counter animation ──────────────────────────────────────────
function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const dur   = 600;
  const t0    = performance.now();
  function frame(now) {
    const p = Math.min((now - t0) / dur, 1);
    el.textContent = Math.round(start + (target - start) * ease(p));
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
function ease(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

// ── Confetti ───────────────────────────────────────────────────
function launchConfetti() {
  const layer  = document.getElementById("confetti-layer");
  const colors = ["#2b5ce6","#7c51d4","#0a9e7c","#0f1f38","#dde4ef"];
  layer.innerHTML = "";

  for (let i = 0; i < 80; i++) {
    const el = document.createElement("div");
    el.className = "confetti";
    el.style.cssText = `
      left:          ${Math.random() * 100}%;
      background:    ${colors[Math.floor(Math.random() * colors.length)]};
      width:         ${4 + Math.random() * 8}px;
      height:        ${4 + Math.random() * 8}px;
      border-radius: ${Math.random() > 0.5 ? "50%" : "0"};
      --dur:         ${2 + Math.random() * 2}s;
      --delay:       ${Math.random() * 1.2}s;
    `;
    layer.appendChild(el);
  }

  setTimeout(() => { layer.innerHTML = ""; }, 4500);
}

// ── Utilities ──────────────────────────────────────────────────
function shortAddr(addr, chars = 6) {
  if (!addr || addr.length < 12) return addr;
  return addr.slice(0, chars) + "…" + addr.slice(-4);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}