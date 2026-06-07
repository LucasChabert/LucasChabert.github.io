import React, { useState, useEffect, useMemo, useCallback } from "react";

// ============================================================
//  CONFIGURATION SUPABASE
//  Colle ta cle anon/publishable (publique, protegee par RLS).
//  NE METS JAMAIS la cle service_role ici.
// ============================================================
const SUPABASE_URL = "https://pddfgcxmlnmqxbufthpz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZGZnY3htbG5tcXhidWZ0aHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzIyNTcsImV4cCI6MjA5NjM0ODI1N30.L4DH5q38KaZdi4KfxRfzoT4fC-REGw-PkN4j8JGeUpk";

// NOTE SECURITE : le mot de passe de profil est stocke en clair et compare
// cote client. C'est un garde-fou entre amis, PAS une vraie securite.
// Pour du serieux, passer a Supabase Auth (mots de passe haches).

const H = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};
const api = (chemin) => `${SUPABASE_URL}/rest/v1/${chemin}`;

// ------------------------------------------------------------
//  Hachage du mot de passe (SHA-256, cote navigateur).
//  Le mot de passe en clair ne quitte jamais le navigateur ; seule
//  l'empreinte est envoyee/comparee. NB : protection limitee, voir note.
// ------------------------------------------------------------
async function hacher(motDePasse) {
  const data = new TextEncoder().encode(motDePasse);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ------------------------------------------------------------
//  KaTeX
// ------------------------------------------------------------
function useKatex() {
  const [pret, setPret] = useState(!!window.katex);
  useEffect(() => {
    if (window.katex) { setPret(true); return; }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js";
    js.onload = () => setPret(true);
    document.head.appendChild(js);
  }, []);
  return pret;
}

function rendreLatex(texte, katexPret) {
  if (!texte) return "";
  if (!katexPret || !window.katex) return texte;
  const morceaux = [];
  const regex = /(\$\$[^$]+\$\$|\$[^$]+\$)/g;
  let dernier = 0, m;
  while ((m = regex.exec(texte)) !== null) {
    if (m.index > dernier) morceaux.push({ t: texte.slice(dernier, m.index), math: false });
    const brut = m[0];
    const display = brut.startsWith("$$");
    const contenu = brut.replace(/^\$\$?|\$\$?$/g, "");
    morceaux.push({ t: contenu, math: true, display });
    dernier = m.index + brut.length;
  }
  if (dernier < texte.length) morceaux.push({ t: texte.slice(dernier), math: false });
  return morceaux.map((p) => {
    if (!p.math) return p.t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    try { return window.katex.renderToString(p.t, { displayMode: p.display, throwOnError: false }); }
    catch { return p.t; }
  }).join("");
}

function Latex({ children, katexPret }) {
  const html = useMemo(() => rendreLatex(children, katexPret), [children, katexPret]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function couleurElo(e) { return e < 1100 ? "#3a7d44" : e < 1400 ? "#caa43a" : e < 1700 ? "#c8762f" : "#b3402f"; }
function labelElo(e) { return e < 1100 ? "Application" : e < 1400 ? "Entraînement" : e < 1700 ? "Concours" : "X-ENS"; }

// ============================================================
//  ECRAN DE CONNEXION / CREATION DE PROFIL
// ============================================================
function Connexion({ onConnecte }) {
  const [profils, setProfils] = useState([]);
  const [mode, setMode] = useState("choisir"); // choisir | creer
  const [pseudo, setPseudo] = useState("");
  const [mdp, setMdp] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(api("profils?select=id,pseudo"), { headers: H })
      .then((r) => r.json()).then(setProfils).catch(() => {});
  }, []);

  async function seConnecter() {
    setMsg("");
    const r = await fetch(api(`profils?pseudo=eq.${encodeURIComponent(pseudo)}&select=*`), { headers: H });
    const data = await r.json();
    if (!data.length) { setMsg("Pseudo inconnu."); return; }
    const empreinte = await hacher(mdp);
    if (data[0].mot_de_passe !== empreinte) { setMsg("Mot de passe incorrect."); return; }
    onConnecte(data[0]);
  }

  async function creer() {
    setMsg("");
    if (!pseudo.trim() || !mdp.trim()) { setMsg("Pseudo et mot de passe requis."); return; }
    const r = await fetch(api("profils"), {
      method: "POST",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ pseudo: pseudo.trim(), mot_de_passe: await hacher(mdp) }),
    });
    if (r.status === 409) { setMsg("Ce pseudo existe déjà."); return; }
    if (!r.ok) { setMsg("Erreur à la création."); return; }
    const data = await r.json();
    onConnecte(data[0]);
  }

  return (
    <div className="connexion">
      <h1>Banque d'exercices</h1>
      <p className="sous-titre">Prépa MPSI · MP</p>

      <div className="onglets-co">
        <button className={mode === "choisir" ? "actif" : ""} onClick={() => setMode("choisir")}>Se connecter</button>
        <button className={mode === "creer" ? "actif" : ""} onClick={() => setMode("creer")}>Créer un profil</button>
      </div>

      {mode === "choisir" && profils.length > 0 && (
        <div className="champ">
          <label>Profils existants</label>
          <select onChange={(e) => setPseudo(e.target.value)} value={pseudo}>
            <option value="">— choisir —</option>
            {profils.map((p) => <option key={p.id} value={p.pseudo}>{p.pseudo}</option>)}
          </select>
        </div>
      )}

      {mode === "creer" && (
        <div className="champ">
          <label>Nouveau pseudo</label>
          <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} placeholder="ton pseudo" />
        </div>
      )}

      <div className="champ">
        <label>Mot de passe</label>
        <input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} placeholder="••••••" />
      </div>

      <button className="btn-principal" onClick={mode === "creer" ? creer : seConnecter}>
        {mode === "creer" ? "Créer et entrer" : "Entrer"}
      </button>

      {msg && <div className="msg-co">{msg}</div>}
      <p className="avert-co">Mot de passe haché (SHA-256) — protection limitée, n'utilise pas un mot de passe sensible.</p>
    </div>
  );
}

// ============================================================
//  CARTE EXERCICE
// ============================================================
function CarteExo({ exo, chapitresById, katexPret, onResultat, dejaFait }) {
  const [ouvert, setOuvert] = useState(false);
  const chap = chapitresById[exo.chapitre_id];
  return (
    <article className="exo">
      <div className="exo-tete">
        <div className="exo-meta">
          {chap && <span className="badge-chap">{chap.filiere} · {chap.nom}</span>}
          {exo.source && <span className="exo-source">{exo.source}</span>}
        </div>
        <div className="exo-elo" style={{ "--c": couleurElo(exo.elo) }}>
          <span className="elo-pastille" /><span className="elo-num">{exo.elo}</span>
          <span className="elo-label">{labelElo(exo.elo)}</span>
        </div>
      </div>
      <div className="exo-enonce"><Latex katexPret={katexPret}>{exo.enonce}</Latex></div>
      {Array.isArray(exo.tags) && exo.tags.length > 0 && (
        <div className="exo-tags">{exo.tags.map((t, i) => <span key={i} className="tag">{t}</span>)}</div>
      )}
      {exo.correction && (
        <div className="exo-corr">
          <button className="corr-btn" onClick={() => setOuvert(!ouvert)}>
            {ouvert ? "▾ Masquer la correction" : "▸ Voir la correction"}
          </button>
          {ouvert && <div className="corr-contenu"><Latex katexPret={katexPret}>{exo.correction}</Latex></div>}
        </div>
      )}
      {onResultat && (
        <div className="exo-actions">
          {dejaFait ? (
            <span className="deja">Déjà tenté ({dejaFait === "reussi" ? "réussi" : "raté"})</span>
          ) : (
            <>
              <button className="btn-reussi" onClick={() => onResultat(exo, true)}>J'ai réussi</button>
              <button className="btn-rate" onClick={() => onResultat(exo, false)}>J'ai raté</button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

// ============================================================
//  APP
// ============================================================
export default function App() {
  const katexPret = useKatex();
  const [profil, setProfil] = useState(null);
  const [exos, setExos] = useState([]);
  const [chapitres, setChapitres] = useState([]);
  const [tentatives, setTentatives] = useState([]); // {exercice_id, reussi}
  const [vue, setVue] = useState("entrainement"); // entrainement | liste
  const [chargement, setChargement] = useState(false);

  // filtres liste
  const [filiere, setFiliere] = useState("Toutes");
  const [chapitreId, setChapitreId] = useState("Tous");
  const [tri, setTri] = useState("elo_asc");

  // entrainement
  const [exoCourant, setExoCourant] = useState(null);
  const [filiereEntr, setFiliereEntr] = useState("Toutes");
  const [chapitreEntr, setChapitreEntr] = useState("Tous");

  const chargerDonnees = useCallback(async (prof) => {
    setChargement(true);
    try {
      const [rE, rC, rT] = await Promise.all([
        fetch(api("exercices?select=*"), { headers: H }),
        fetch(api("chapitres?select=*"), { headers: H }),
        fetch(api(`tentatives?profil_id=eq.${prof.id}&select=exercice_id,reussi`), { headers: H }),
      ]);
      // On ne garde que ce qui est bien un tableau ; sinon liste vide.
      const safe = async (r) => {
        const d = await r.json();
        return Array.isArray(d) ? d : [];
      };
      setExos(await safe(rE));
      setChapitres(await safe(rC));
      setTentatives(await safe(rT));
    } catch (e) {
      console.error("Erreur de chargement :", e);
      setExos([]); setChapitres([]); setTentatives([]);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { if (profil) chargerDonnees(profil); }, [profil, chargerDonnees]);

  const chapitresById = useMemo(() => {
    const o = {}; chapitres.forEach((c) => (o[c.id] = c)); return o;
  }, [chapitres]);

  const filieres = useMemo(
    () => ["Toutes", ...Array.from(new Set(chapitres.map((c) => c.filiere))).sort()],
    [chapitres]
  );

  // map exercice_id -> "reussi" | "rate"
  const faitsParExo = useMemo(() => {
    const o = {};
    tentatives.forEach((t) => { o[t.exercice_id] = t.reussi ? "reussi" : "rate"; });
    return o;
  }, [tentatives]);

  // --- Tirage aleatoire d'un exo NON tente ---
  const tirerExo = useCallback(() => {
    let pool = exos.filter((x) => !faitsParExo[x.id]);
    if (filiereEntr !== "Toutes")
      pool = pool.filter((x) => chapitresById[x.chapitre_id]?.filiere === filiereEntr);
    if (chapitreEntr !== "Tous")
      pool = pool.filter((x) => x.chapitre_id === chapitreEntr);
    if (!pool.length) { setExoCourant(null); return; }
    setExoCourant(pool[Math.floor(Math.random() * pool.length)]);
  }, [exos, faitsParExo, filiereEntr, chapitreEntr, chapitresById]);

  // --- Enregistrer un resultat (auto-evaluation) ---
  async function enregistrer(exo, reussi) {
    await fetch(api("tentatives"), {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ profil_id: profil.id, exercice_id: exo.id, reussi }),
    });
    setTentatives((prev) => [...prev, { exercice_id: exo.id, reussi }]);
    setExoCourant(null); // declenche un nouveau tirage
  }

  const exosListe = useMemo(() => {
    let xs = [...exos];
    if (filiere !== "Toutes") xs = xs.filter((x) => chapitresById[x.chapitre_id]?.filiere === filiere);
    if (chapitreId !== "Tous") xs = xs.filter((x) => x.chapitre_id === chapitreId);
    xs.sort((a, b) => (tri === "elo_desc" ? b.elo - a.elo : a.elo - b.elo));
    return xs;
  }, [exos, chapitresById, filiere, chapitreId, tri]);

  const stats = useMemo(() => {
    const total = exos.length;
    const faits = tentatives.length;
    const reussis = tentatives.filter((t) => t.reussi).length;
    return { total, faits, reussis };
  }, [exos, tentatives]);

  if (!profil) {
    return <div className="app"><style>{CSS}</style><Connexion onConnecte={setProfil} /></div>;
  }

  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="entete">
        <div className="entete-titre">
          <h1>Banque d'exercices</h1>
          <p className="sous-titre">Bonjour {profil.pseudo} — {stats.faits}/{stats.total} faits · {stats.reussis} réussis</p>
        </div>
        <button className="btn-deco" onClick={() => { setProfil(null); setExoCourant(null); }}>Changer de profil</button>
      </header>

      <nav className="onglets">
        <button className={vue === "entrainement" ? "actif" : ""} onClick={() => setVue("entrainement")}>Entraînement</button>
        <button className={vue === "liste" ? "actif" : ""} onClick={() => setVue("liste")}>Tous les exos</button>
      </nav>

      {chargement && <div className="info">Chargement…</div>}

      {vue === "entrainement" && !chargement && (
        <section className="entrainement">
          <div className="barre-filtres">
            <div className="champ">
              <label>Chapitre</label>
              <select value={chapitreEntr} onChange={(e) => { setChapitreEntr(e.target.value); setExoCourant(null); }}>
                <option value="Tous">Tous</option>
                {chapitres.filter((c) => filiereEntr === "Toutes" || c.filiere === filiereEntr)
                  .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
                  .map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <button className="btn-tirer" onClick={tirerExo}>Autre exercice →</button>
          </div>

          {exoCourant ? (
            <CarteExo exo={exoCourant} chapitresById={chapitresById} katexPret={katexPret}
                      onResultat={enregistrer} dejaFait={null} />
          ) : (
            <div className="info">Plus d'exercice non tenté dans cette sélection. Change de filière ou consulte « Tous les exos ».</div>
          )}
        </section>
      )}

      {vue === "liste" && !chargement && (
        <section>
          <div className="barre-filtres">
            <div className="champ">
              <label>Filière</label>
              <select value={filiere} onChange={(e) => { setFiliere(e.target.value); setChapitreId("Tous"); }}>
                {filieres.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="champ">
              <label>Chapitre</label>
              <select value={chapitreId} onChange={(e) => setChapitreId(e.target.value)}>
                <option value="Tous">Tous</option>
                {chapitres.filter((c) => filiere === "Toutes" || c.filiere === filiere)
                  .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
                  .map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div className="champ">
              <label>Tri</label>
              <select value={tri} onChange={(e) => setTri(e.target.value)}>
                <option value="elo_asc">Elo croissant</option>
                <option value="elo_desc">Elo décroissant</option>
              </select>
            </div>
          </div>
          <div className="liste">
            {exosListe.map((exo) => (
              <CarteExo key={exo.id} exo={exo} chapitresById={chapitresById} katexPret={katexPret}
                        onResultat={enregistrer} dejaFait={faitsParExo[exo.id]} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Spline+Sans+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
.app {
  --encre:#1a1812; --papier:#f4f0e6; --papier-2:#ece6d8; --trait:#d4cdb8; --accent:#7d3a2f;
  --vert:#3a7d44; --rouge:#b3402f;
  min-height:100vh;
  background:radial-gradient(circle at 12% 8%, rgba(125,58,47,0.04), transparent 40%), var(--papier);
  color:var(--encre); font-family:'Newsreader',Georgia,serif;
  padding:2.2rem clamp(1rem,5vw,4rem);
}
h1 { font-family:'Fraunces',serif; font-weight:700; font-size:clamp(1.9rem,4vw,3rem); letter-spacing:-0.02em; line-height:1; }
.sous-titre { font-style:italic; color:#6b6453; margin-top:0.4rem; font-size:1.02rem; }

/* connexion */
.connexion { max-width:380px; margin:8vh auto; display:flex; flex-direction:column; gap:1rem; }
.onglets-co { display:flex; gap:0.5rem; margin-top:1rem; }
.onglets-co button, .onglets button {
  font-family:'Spline Sans Mono',monospace; font-size:0.8rem; padding:0.5rem 0.9rem;
  background:var(--papier-2); border:1px solid var(--trait); border-radius:2px; cursor:pointer; color:#6b6453;
}
.onglets-co button.actif, .onglets button.actif { background:var(--accent); color:#fff; border-color:var(--accent); }
.btn-principal {
  font-family:'Spline Sans Mono',monospace; font-size:0.9rem; padding:0.7rem; cursor:pointer;
  background:var(--accent); color:#fff; border:none; border-radius:2px; margin-top:0.5rem;
}
.msg-co { color:var(--rouge); font-family:'Spline Sans Mono',monospace; font-size:0.82rem; }
.avert-co { font-size:0.78rem; color:#6b6453; font-style:italic; }

/* entete */
.entete { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid var(--encre); padding-bottom:1.1rem; }
.btn-deco { font-family:'Spline Sans Mono',monospace; font-size:0.78rem; background:none; border:1px solid var(--trait); padding:0.4rem 0.7rem; border-radius:2px; cursor:pointer; color:#6b6453; }
.onglets { display:flex; gap:0.5rem; margin:1.3rem 0; }

.barre-filtres { display:flex; flex-wrap:wrap; gap:1rem; align-items:flex-end; padding-bottom:1.3rem; margin-bottom:1.3rem; border-bottom:1px solid var(--trait); }
.champ { display:flex; flex-direction:column; gap:0.3rem; }
.champ label { font-family:'Spline Sans Mono',monospace; font-size:0.66rem; text-transform:uppercase; letter-spacing:0.15em; color:#6b6453; }
.champ select, .champ input { font-family:'Newsreader',serif; font-size:0.98rem; padding:0.5rem 0.7rem; border:1px solid var(--trait); background:var(--papier-2); color:var(--encre); border-radius:2px; min-width:150px; outline:none; }
.champ select:focus, .champ input:focus { border-color:var(--accent); }
.btn-tirer { font-family:'Spline Sans Mono',monospace; font-size:0.85rem; padding:0.55rem 1rem; background:var(--encre); color:var(--papier); border:none; border-radius:2px; cursor:pointer; }

.liste { display:flex; flex-direction:column; gap:1.1rem; }
.exo { background:#fbf8f0; border:1px solid var(--trait); border-left:3px solid var(--accent); border-radius:3px; padding:1.4rem 1.6rem; box-shadow:0 8px 24px -18px rgba(0,0,0,0.4); animation:monte 0.4s ease both; }
@keyframes monte { from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:none;} }
.exo-tete { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:0.9rem; }
.exo-meta { display:flex; flex-direction:column; gap:0.25rem; }
.badge-chap { font-family:'Spline Sans Mono',monospace; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--accent); font-weight:500; }
.exo-source { font-style:italic; font-size:0.85rem; color:#6b6453; }
.exo-elo { display:flex; align-items:center; gap:0.4rem; flex-shrink:0; }
.elo-pastille { width:9px; height:9px; border-radius:50%; background:var(--c); }
.elo-num { font-family:'Spline Sans Mono',monospace; font-weight:500; font-size:0.95rem; color:var(--c); }
.elo-label { font-family:'Spline Sans Mono',monospace; font-size:0.62rem; text-transform:uppercase; letter-spacing:0.1em; color:#6b6453; border:1px solid var(--trait); padding:0.15rem 0.4rem; border-radius:2px; }
.exo-enonce { font-size:1.12rem; line-height:1.6; }
.exo-tags { display:flex; flex-wrap:wrap; gap:0.4rem; margin-top:0.9rem; }
.tag { font-family:'Spline Sans Mono',monospace; font-size:0.7rem; background:var(--papier-2); color:#6b6453; padding:0.2rem 0.5rem; border-radius:2px; border:1px solid var(--trait); }
.exo-corr { margin-top:1rem; border-top:1px dashed var(--trait); padding-top:0.8rem; }
.corr-btn { font-family:'Spline Sans Mono',monospace; font-size:0.82rem; background:none; border:none; color:var(--accent); cursor:pointer; padding:0; }
.corr-btn:hover { text-decoration:underline; }
.corr-contenu { margin-top:0.8rem; padding:0.9rem 1.1rem; background:var(--papier-2); border-radius:3px; font-size:1.05rem; line-height:1.6; animation:monte 0.3s ease both; }
.exo-actions { display:flex; gap:0.7rem; margin-top:1.1rem; padding-top:0.9rem; border-top:1px solid var(--trait); }
.btn-reussi, .btn-rate { font-family:'Spline Sans Mono',monospace; font-size:0.85rem; padding:0.5rem 1rem; border:none; border-radius:2px; cursor:pointer; color:#fff; }
.btn-reussi { background:var(--vert); }
.btn-rate { background:var(--rouge); }
.deja { font-family:'Spline Sans Mono',monospace; font-size:0.8rem; color:#6b6453; font-style:italic; }
.info { text-align:center; padding:3rem 1rem; color:#6b6453; font-style:italic; font-size:1.05rem; }
`;