import React, { useState, useEffect, useMemo } from "react";

// ============================================================
//  CONFIGURATION SUPABASE
//  Colle ici tes deux valeurs. La cle anon/publishable est
//  faite pour etre publique (elle est protegee par les regles
//  RLS de ta base), donc pas de souci a la mettre dans le front.
//  NE METS JAMAIS la cle service_role ici.
// ============================================================
const SUPABASE_URL = "https://pddfgcxmlnmqxbufthpz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-KpOP_z7IZVnZu8SBmPhVA_DEOtHt3Y";

// ------------------------------------------------------------
//  Rendu LaTeX via KaTeX (charge depuis un CDN au montage)
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

// Rend un texte mixte (prose + $...$ et $$...$$) en HTML KaTeX.
function rendreLatex(texte, katexPret) {
  if (!texte) return "";
  if (!katexPret || !window.katex) return texte;
  // On decoupe sur $$...$$ puis $...$
  const morceaux = [];
  let reste = texte;
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
    try {
      return window.katex.renderToString(p.t, {
        displayMode: p.display, throwOnError: false,
      });
    } catch { return p.t; }
  }).join("");
}

function Latex({ children, katexPret, bloc }) {
  const html = useMemo(() => rendreLatex(children, katexPret), [children, katexPret]);
  return <span className={bloc ? "latex-bloc" : ""} dangerouslySetInnerHTML={{ __html: html }} />;
}

// ------------------------------------------------------------
//  Couleur d'Elo (du plus facile au plus dur)
// ------------------------------------------------------------
function couleurElo(elo) {
  if (elo < 1100) return "#3a7d44";      // vert
  if (elo < 1400) return "#caa43a";      // jaune-or
  if (elo < 1700) return "#c8762f";      // orange
  return "#b3402f";                       // rouge
}
function labelElo(elo) {
  if (elo < 1100) return "Application";
  if (elo < 1400) return "Entraînement";
  if (elo < 1700) return "Concours";
  return "X-ENS";
}

// ------------------------------------------------------------
//  Carte d'un exercice (avec correction depliable)
// ------------------------------------------------------------
function CarteExo({ exo, chapitresById, katexPret }) {
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
          <span className="elo-pastille" />
          <span className="elo-num">{exo.elo}</span>
          <span className="elo-label">{labelElo(exo.elo)}</span>
        </div>
      </div>

      <div className="exo-enonce">
        <Latex katexPret={katexPret}>{exo.enonce}</Latex>
      </div>

      {Array.isArray(exo.tags) && exo.tags.length > 0 && (
        <div className="exo-tags">
          {exo.tags.map((t, i) => <span key={i} className="tag">{t}</span>)}
        </div>
      )}

      {exo.correction && (
        <div className="exo-corr">
          <button className="corr-btn" onClick={() => setOuvert(!ouvert)}>
            {ouvert ? "▾ Masquer la correction" : "▸ Voir la correction"}
          </button>
          {ouvert && (
            <div className="corr-contenu">
              <Latex katexPret={katexPret}>{exo.correction}</Latex>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ------------------------------------------------------------
//  Application principale
// ------------------------------------------------------------
export default function App() {
  const katexPret = useKatex();
  const [exos, setExos] = useState([]);
  const [chapitres, setChapitres] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  // filtres
  const [filiere, setFiliere] = useState("Toutes");
  const [chapitreId, setChapitreId] = useState("Tous");
  const [tri, setTri] = useState("elo_asc");
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    async function charger() {
      try {
        const head = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
        const [rExos, rChap] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/exercices?select=*`, { headers: head }),
          fetch(`${SUPABASE_URL}/rest/v1/chapitres?select=*`, { headers: head }),
        ]);
        if (!rExos.ok || !rChap.ok) throw new Error("Réponse Supabase invalide. Vérifie ta clé anon et les règles RLS (lecture autorisée pour le rôle anon).");
        setExos(await rExos.json());
        setChapitres(await rChap.json());
      } catch (e) {
        setErreur(e.message);
      } finally {
        setChargement(false);
      }
    }
    charger();
  }, []);

  const chapitresById = useMemo(() => {
    const o = {};
    chapitres.forEach((c) => { o[c.id] = c; });
    return o;
  }, [chapitres]);

  const filieres = useMemo(
    () => ["Toutes", ...Array.from(new Set(chapitres.map((c) => c.filiere))).sort()],
    [chapitres]
  );

  const chapitresFiltres = useMemo(() => {
    let cs = chapitres;
    if (filiere !== "Toutes") cs = cs.filter((c) => c.filiere === filiere);
    return cs.sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  }, [chapitres, filiere]);

  const exosAffiches = useMemo(() => {
    let xs = [...exos];
    if (filiere !== "Toutes")
      xs = xs.filter((x) => chapitresById[x.chapitre_id]?.filiere === filiere);
    if (chapitreId !== "Tous")
      xs = xs.filter((x) => x.chapitre_id === chapitreId);
    if (recherche.trim()) {
      const q = recherche.toLowerCase();
      xs = xs.filter((x) =>
        (x.enonce || "").toLowerCase().includes(q) ||
        (x.source || "").toLowerCase().includes(q) ||
        (Array.isArray(x.tags) && x.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }
    xs.sort((a, b) => {
      if (tri === "elo_asc") return a.elo - b.elo;
      if (tri === "elo_desc") return b.elo - a.elo;
      return 0;
    });
    return xs;
  }, [exos, chapitresById, filiere, chapitreId, recherche, tri]);

  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="entete">
        <div className="entete-titre">
          <h1>Banque d'exercices</h1>
          <p className="sous-titre">Prépa MPSI · MP — classés par difficulté Elo</p>
        </div>
        <div className="compteur">
          <span className="compteur-num">{exosAffiches.length}</span>
          <span className="compteur-lab">exercices</span>
        </div>
      </header>

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
            {chapitresFiltres.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <div className="champ">
          <label>Tri</label>
          <select value={tri} onChange={(e) => setTri(e.target.value)}>
            <option value="elo_asc">Elo croissant</option>
            <option value="elo_desc">Elo décroissant</option>
          </select>
        </div>
        <div className="champ champ-large">
          <label>Recherche</label>
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
                 placeholder="énoncé, source, tag…" />
        </div>
      </div>

      {chargement && <div className="info">Chargement des exercices…</div>}
      {erreur && <div className="info erreur">{erreur}</div>}
      {!chargement && !erreur && exosAffiches.length === 0 && (
        <div className="info">Aucun exercice ne correspond à ces filtres.</div>
      )}

      <main className="liste">
        {exosAffiches.map((exo) => (
          <CarteExo key={exo.id} exo={exo} chapitresById={chapitresById} katexPret={katexPret} />
        ))}
      </main>
    </div>
  );
}

// ------------------------------------------------------------
//  Styles — esthétique éditoriale / papier mathématique
// ------------------------------------------------------------
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Spline+Sans+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }

.app {
  --encre: #1a1812;
  --papier: #f4f0e6;
  --papier-2: #ece6d8;
  --trait: #d4cdb8;
  --accent: #7d3a2f;
  min-height: 100vh;
  background:
    radial-gradient(circle at 12% 8%, rgba(125,58,47,0.04), transparent 40%),
    var(--papier);
  color: var(--encre);
  font-family: 'Newsreader', Georgia, serif;
  padding: 2.2rem clamp(1rem, 5vw, 4rem);
}

.entete {
  display: flex; justify-content: space-between; align-items: flex-end;
  border-bottom: 2px solid var(--encre);
  padding-bottom: 1.1rem; margin-bottom: 0.4rem;
}
.entete h1 {
  font-family: 'Fraunces', serif; font-weight: 700;
  font-size: clamp(1.9rem, 4vw, 3rem); letter-spacing: -0.02em; line-height: 1;
}
.sous-titre { font-style: italic; color: #6b6453; margin-top: 0.4rem; font-size: 1.02rem; }
.compteur { text-align: right; font-family: 'Spline Sans Mono', monospace; }
.compteur-num { display: block; font-size: 2rem; font-weight: 500; color: var(--accent); line-height: 1; }
.compteur-lab { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.15em; color: #6b6453; }

.barre-filtres {
  display: flex; flex-wrap: wrap; gap: 1rem;
  padding: 1.3rem 0; margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--trait);
}
.champ { display: flex; flex-direction: column; gap: 0.3rem; }
.champ-large { flex: 1; min-width: 180px; }
.champ label {
  font-family: 'Spline Sans Mono', monospace; font-size: 0.66rem;
  text-transform: uppercase; letter-spacing: 0.15em; color: #6b6453;
}
.champ select, .champ input {
  font-family: 'Newsreader', serif; font-size: 0.98rem;
  padding: 0.5rem 0.7rem; border: 1px solid var(--trait);
  background: var(--papier-2); color: var(--encre); border-radius: 2px;
  min-width: 150px; outline: none;
}
.champ select:focus, .champ input:focus { border-color: var(--accent); }

.liste { display: flex; flex-direction: column; gap: 1.1rem; }

.exo {
  background: #fbf8f0;
  border: 1px solid var(--trait);
  border-left: 3px solid var(--accent);
  border-radius: 3px;
  padding: 1.4rem 1.6rem;
  box-shadow: 0 1px 0 rgba(0,0,0,0.03), 0 8px 24px -18px rgba(0,0,0,0.4);
  animation: monte 0.4s ease both;
}
@keyframes monte { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.exo-tete { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.9rem; }
.exo-meta { display: flex; flex-direction: column; gap: 0.25rem; }
.badge-chap {
  font-family: 'Spline Sans Mono', monospace; font-size: 0.72rem;
  text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); font-weight: 500;
}
.exo-source { font-style: italic; font-size: 0.85rem; color: #6b6453; }

.exo-elo { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }
.elo-pastille { width: 9px; height: 9px; border-radius: 50%; background: var(--c); }
.elo-num { font-family: 'Spline Sans Mono', monospace; font-weight: 500; font-size: 0.95rem; color: var(--c); }
.elo-label {
  font-family: 'Spline Sans Mono', monospace; font-size: 0.62rem;
  text-transform: uppercase; letter-spacing: 0.1em; color: #6b6453;
  border: 1px solid var(--trait); padding: 0.15rem 0.4rem; border-radius: 2px;
}

.exo-enonce { font-size: 1.12rem; line-height: 1.6; }
.latex-bloc { display: block; margin: 0.5rem 0; overflow-x: auto; }

.exo-tags { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.9rem; }
.tag {
  font-family: 'Spline Sans Mono', monospace; font-size: 0.7rem;
  background: var(--papier-2); color: #6b6453;
  padding: 0.2rem 0.5rem; border-radius: 2px; border: 1px solid var(--trait);
}

.exo-corr { margin-top: 1rem; border-top: 1px dashed var(--trait); padding-top: 0.8rem; }
.corr-btn {
  font-family: 'Spline Sans Mono', monospace; font-size: 0.82rem;
  background: none; border: none; color: var(--accent); cursor: pointer;
  padding: 0; letter-spacing: 0.03em;
}
.corr-btn:hover { text-decoration: underline; }
.corr-contenu {
  margin-top: 0.8rem; padding: 0.9rem 1.1rem;
  background: var(--papier-2); border-radius: 3px;
  font-size: 1.05rem; line-height: 1.6;
  animation: monte 0.3s ease both;
}

.info { text-align: center; padding: 3rem 1rem; color: #6b6453; font-style: italic; font-size: 1.05rem; }
.info.erreur { color: var(--accent); font-style: normal; font-family: 'Spline Sans Mono', monospace; font-size: 0.9rem; max-width: 600px; margin: 2rem auto; line-height: 1.5; }
`;
